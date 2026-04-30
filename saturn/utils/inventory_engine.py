# -*- coding: utf-8 -*-
import frappe
from frappe.utils import flt, add_days, today

@frappe.whitelist()
def execute_daily_reorder_update():
    # 1. التحقق من تفعيل النظام وجلب البروفايل الافتراضي
    settings = frappe.get_single("Saturn Settings")
    if not settings.enabled:
        return "Saturn Engine is disabled in Settings."

    if not settings.default_reorder_profile:
        return "Error: Please set a Default Reorder Profile in Saturn Settings."

    # جلب وثيقة البروفايل الافتراضي لاستخدام قيمها كاحتياط (Fallback)
    default_profile_doc = frappe.get_doc("Saturn Reorder Profile", settings.default_reorder_profile)
    
    # 2. جلب الأصناف (المخزنية وغير المعطلة)
    items = frappe.get_all("Item", 
                           filters={
                               "is_stock_item": 1,
                               "is_smart_reorder": 1,
                               "disabled": 0
                           }, 
                           fields=["name", "custom_reorder_profile"])

    processed_count = 0
    
    for item in items:
        try:
            item_code = item.name
            
            # 3. تحديد البروفايل النشط للصنف (الخاص به أو الافتراضي العام)
            if item.custom_reorder_profile:
                profile = frappe.get_doc("Saturn Reorder Profile", item.custom_reorder_profile)
            else:
                profile = default_profile_doc

            # جلب المعايير من البروفايل المعتمد
            analysis_period = profile.analysis_period
            coverage_months = profile.coverage_months
            safety_stock_percent = profile.safety_stock_percent
            target_warehouse = profile.default_warehouse 

            if not target_warehouse:
                continue # لا يمكن حساب إعادة الطلب بدون تحديد مستودع هدف في البروفايل

            # 4. حساب الاستهلاك بناءً على فترة التحليل
            start_date = add_days(today(), -int(analysis_period))
            
            consumed_qty = frappe.db.sql("""
                SELECT SUM(actual_qty * -1) 
                FROM `tabStock Ledger Entry` 
                WHERE item_code = %s 
                AND actual_qty < 0 
                AND posting_date >= %s
            """, (item_code, start_date))[0][0] or 0

            if consumed_qty > 0:
                daily_usage = flt(consumed_qty) / flt(analysis_period)
                coverage_days = flt(coverage_months) * 30
                safety_factor = 1 + (flt(safety_stock_percent) / 100)
                
                # الحسابات النهائية (LaTeX للتوضيح الرياضي)
                # $$ Reorder Level = (Daily Usage \times Coverage Days) \times Safety Factor $$
                new_level = flt(daily_usage * coverage_days * safety_factor, 2)
                new_qty = flt(daily_usage * coverage_days, 2)

                # 5. تحديث أو إضافة المستويات في جدول إعادة الطلب (Item Reorder)
                # نبحث عن سطر يطابق الصنف والمستودع المستهدف من البروفايل
                existing_row = frappe.db.get_value("Item Reorder", 
                                                 {"parent": item_code, "warehouse": target_warehouse}, 
                                                 "name")
                
                if existing_row:
                    # تحديث السطر الموجود للمستودع المحدد
                    frappe.db.set_value("Item Reorder", existing_row, {
                        "warehouse_reorder_level": new_level,
                        "warehouse_reorder_qty": new_qty,
                        "material_request_type": "Purchase"
                    }, update_modified=True)
                else:
                    # إضافة سطر جديد للمستودع المحدد إذا لم يكن موجوداً
                    item_doc = frappe.get_doc("Item", item_code)
                    item_doc.append("reorder_levels", {
                        "warehouse": target_warehouse,
                        "warehouse_reorder_level": new_level,
                        "warehouse_reorder_qty": new_qty,
                        "material_request_type": "Purchase"
                    })
                    item_doc.flags.ignore_mandatory = True
                    item_doc.flags.ignore_validate = True
                    item_doc.save(ignore_permissions=True)
                
                processed_count += 1

        except Exception:
            frappe.log_error(message=frappe.get_traceback(), title=f"Saturn Profile Error: {item_code}")

    frappe.db.commit()

    # 6. تشغيل محرك إعادة الطلب الرسمي لإنشاء Material Requests
    try:
        from erpnext.stock.reorder_item import reorder_item
        reorder_item()
    except Exception:
        frappe.log_error(title="Saturn: Auto MR Trigger Failed", message=frappe.get_traceback())

    return f"Success: Processed {processed_count} items using Profile logic."
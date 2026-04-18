# -*- coding: utf-8 -*-
import frappe
from frappe.utils import flt

@frappe.whitelist()
def execute_daily_reorder_update():
    settings = frappe.get_single("Saturn Settings")
    if not settings.enabled:
        return

    # جلب الأصناف المفعّلة
    items = frappe.get_all("Item", 
                           filters={"is_stock_item": 1, "disabled": 0, "is_smart_reorder": 1}, 
                           fields=["name", "custom_coverage_months"])

    processed_count = 0
    for item in items:
        try:
            item_code = item.name
            
            # حساب الاستهلاك
            consumed_qty = frappe.db.sql("""
                SELECT SUM(actual_qty * -1) 
                FROM `tabStock Ledger Entry` 
                WHERE item_code = %s 
                AND actual_qty < 0 
                AND posting_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
            """, (item_code, settings.analysis_period or 90))[0][0] or 0

            if consumed_qty > 0:
                daily_usage = flt(consumed_qty) / (settings.analysis_period or 90)
                coverage_months = flt(item.custom_coverage_months) if flt(item.custom_coverage_months) > 0 else (settings.coverage_months or 3)
                coverage_days = coverage_months * 30
                safety_factor = 1 + (flt(settings.safety_stock_percent or 0) / 100)
                
                new_level = flt(daily_usage * coverage_days * safety_factor, 2)
                new_qty = flt(daily_usage * coverage_days, 2)

                # التحقق من وجود صفوف
                reorder_table = frappe.get_all("Item Reorder", filters={"parent": item_code}, fields=["name"])
                
                if reorder_table:
                    # الحالة 1: تحديث الصفوف الموجودة (سريع ومباشر)
                    for row in reorder_table:
                        frappe.db.set_value("Item Reorder", row.name, {
                            "warehouse_reorder_level": new_level,
                            "warehouse_reorder_qty": new_qty,
                            "material_request_type": "Purchase"
                        }, update_modified=True)
                    processed_count += 1
                
                elif settings.default_warehouse:
                    # إضافة صف جديد باستخدام المستودع الافتراضي
                    item_doc = frappe.get_doc("Item", item_code)
                    
                    item_doc.append("reorder_levels", {
                        "warehouse": settings.default_warehouse,
                        "warehouse_reorder_level": new_level,
                        "warehouse_reorder_qty": new_qty,
                        "material_request_type": "Purchase"
                    })
                    
                    # الطريقة الصحيحة لتخطي التحقق من الحقول الإجبارية في V15
                    item_doc.flags.ignore_mandatory = True
                    item_doc.flags.ignore_validate = True # لتخطي أي Validation مخصص قد يعيق الحفظ
                    
                    item_doc.save(ignore_permissions=True)
                    processed_count += 1

        except Exception as e:
            frappe.log_error(message=frappe.get_traceback(), title=f"Saturn Update Error: {item_code}")

    frappe.db.commit()
    # الاستدعاء المنطقي لإنشاء الطلبات فوراً
    try:
        from erpnext.stock.reorder_item import reorder_item
        reorder_item()
        # print("Material Requests triggered successfully.")
    except Exception as e:
        # في حال فشل الاستدعاء، لا تتوقف العملية، فقط سجل الخطأ
        frappe.log_error(title="Saturn: Auto MR Trigger Failed", message=frappe.get_traceback())
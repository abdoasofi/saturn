# Copyright (c) 2025, Asofi and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import date_diff, getdate
import math

class ProcessingAutomaticItemRequests(Document):
    def validate(self):
        self.calculate_number_of_days()
    
    def before_save(self):
        """تحديث القيم في الجدول الفرعي"""
        self.update_child_table_values()
    
    def before_submit(self):
        """التحقق قبل اعتماد المستند"""
        self.validate_reorder_values()
    
    def calculate_number_of_days(self):
        """احتساب عدد الأيام بين from_date و to_date"""
        if self.from_date and self.to_date:
            from_date = getdate(self.from_date)
            to_date = getdate(self.to_date)
            
            if to_date < from_date:
                frappe.throw("To Date cannot be before From Date")
            
            self.number_of_days = date_diff(to_date, from_date) + 1
    
    
    def validate_reorder_values(self):
        """التحقق من عدم وجود صفوف في الجدول الفرعي بقيم reorder تساوي صفر"""
        if not self.automated_item_request_processing_schedule:
            frappe.throw("لا يمكن اعتماد المستند بدون أصناف في الجدول الفرعي")
        
        if not self.request_for:
            frappe.throw("يجب تحديد المستودع المطلوب (Request for) قبل الاعتماد")
        
        zero_reorder_items = []
        for row in self.automated_item_request_processing_schedule:
            if row.warehouse_reorder_level == 0 or row.warehouse_reorder_qty == 0:
                zero_reorder_items.append(row.item)
        
        if zero_reorder_items:
            items_list = ", ".join(zero_reorder_items)
            frappe.throw(
                f"لا يمكن اعتماد المستند لأن الأصناف التالية لديها قيم Reorder تساوي صفر: {items_list}. "
                "يرجى تعيين قيم مناسبة قبل الاعتماد."
            )
    
    @frappe.whitelist()
    def get_items(self):
        """جلب جميع الأصناف من مجموعة الأصناف المحددة"""
        if not self.item_group:
            frappe.throw("Please select Item Group")
        
        if not self.from_date or not self.to_date:
            frappe.throw("Please select From and To dates")
        
        if not self.check_in_group:
            frappe.throw("Please select Check in (group) warehouse")
        
        # احتساب عدد الأيام أولاً
        self.calculate_number_of_days()
        
        # جلب جميع الأصناف في المجموعة
        items = frappe.get_all("Item", 
            filters={"item_group": self.item_group, "disabled": 0},
            fields=["name", "item_name", "item_code"]
        )
        
        # تنظيف الجدول الحالي
        self.set("automated_item_request_processing_schedule", [])
        
        # إضافة الأصناف إلى الجدول فقط إذا كانت outflow_qty > 0
        items_added = 0
        for item in items:
            outflow_qty = self.get_item_quantity_in_stores(item.item_code)
            if outflow_qty > 0:
                row = self.append("automated_item_request_processing_schedule", {})
                row.item = item.item_code
                row.outflow_qty = outflow_qty
                self.calculate_row_values(row)
                items_added += 1
        
        if items_added > 0:
            frappe.msgprint(f"تمت إضافة {items_added} صنف")
        else:
            frappe.msgprint("لم يتم العثور على أصناف متاحة في المستودعات المحددة")
        
        self.save()
    
    def calculate_row_values(self, row):
        """احتساب القيم للصف في الجدول الفرعي"""
        if not row.item:
            return
        
        # حساب outflow_qty من المخازن
        row.outflow_qty = self.get_item_quantity_in_stores(row.item)
        
        # حساب القيم الأخرى
        if self.number_of_days and self.number_of_days > 0:
            row.daily_withdrawal_rate = row.outflow_qty / self.number_of_days
            # تقريب daily_withdrawal_rate إلى أقرب عدد صحيح أكبر
            row.daily_withdrawal_rate = math.ceil(row.daily_withdrawal_rate)

    @frappe.whitelist()
    def get_item_quantity_in_stores(self, item_code):
        """جلب كمية الصنف في جميع المخازن تحت Stores - S"""
        total_qty = 0
        
        # جلب جميع المخازن التي تحت الأب "Stores - S"
        warehouses = frappe.get_all("Warehouse",
            filters={"parent_warehouse": "Stores - S"},
            pluck="name"
        )
        
        if warehouses:
            # جلب الكمية من جدول Bin
            bin_data = frappe.get_all("Bin",
                filters={
                    "item_code": item_code,
                    "warehouse": ["in", warehouses]
                },
                fields=["sum(actual_qty) as total_qty"]
            )
            
            if bin_data and bin_data[0].total_qty:
                total_qty = bin_data[0].total_qty
        
        return total_qty
    
    def update_child_table_values(self):
        """تحديث جميع الصفوف في الجدول الفرعي"""
        if not self.automated_item_request_processing_schedule:
            return
        
        for row in self.automated_item_request_processing_schedule:
            if row.item:
                # تحديث outflow_qty إذا لزم الأمر
                if not row.outflow_qty:
                    row.outflow_qty = self.get_item_quantity_in_stores(row.item)
                
                # إعادة حساب القيم
                self.calculate_row_values(row)
    
    def on_submit(self):
        """عند اعتماد المستند، قم بإضافة Reorder Levels للأصناف"""
        self.add_reorder_levels_to_items()
    
    def add_reorder_levels_to_items(self):
        """إضافة Reorder Levels للأصناف في الجدول الفرعي إلى سجل كل صنف"""
        if not self.automated_item_request_processing_schedule:
            return
        
        if not self.request_for:
            frappe.throw("يجب تحديد المستودع المطلوب (Request for) قبل الاعتماد")
        
        items_processed = 0
        for row in self.automated_item_request_processing_schedule:
            if not row.item or row.warehouse_reorder_level == 0 or row.warehouse_reorder_qty == 0:
                continue
            
            # جلب مستند الصنف
            item_doc = frappe.get_doc("Item", row.item)
            
            # إنشاء قائمة جديدة بدون السجلات الخاصة بالمستودع المحدد
            new_reorder_levels = []
            for reorder in item_doc.get("reorder_levels", []):
                if reorder.warehouse != self.request_for:
                    new_reorder_levels.append(reorder)
            
            # مسح الجدول وإعادة إضافة السجلات المتبقية
            item_doc.set("reorder_levels", new_reorder_levels)
            
            # إضافة سجل Reorder جديد للمستودع المحدد
            reorder_row = {
                "warehouse": self.request_for,
                "warehouse_group" : self.check_in_group,
                "warehouse_reorder_level": row.warehouse_reorder_level,
                "warehouse_reorder_qty": row.warehouse_reorder_qty,
                "material_request_type": self.material_request_type or "Purchase"
            }
            
            item_doc.append("reorder_levels", reorder_row)
            
            # حفظ التغييرات
            item_doc.save()
            items_processed += 1
        
        frappe.msgprint(f"تم تحديث إعدادات إعادة الطلب لـ {items_processed} صنف في المستودع {self.request_for}")
    
    def on_cancel(self):
        """عند إلغاء المستند، قم بإزالة Reorder Levels من الأصناف"""
        self.remove_reorder_levels_from_items()
    
    def remove_reorder_levels_from_items(self):
        """إزالة Reorder Levels من الأصناف"""
        if not self.automated_item_request_processing_schedule or not self.request_for:
            return
        
        items_processed = 0
        for row in self.automated_item_request_processing_schedule:
            if not row.item:
                continue
            
            # جلب مستند الصنف
            item_doc = frappe.get_doc("Item", row.item)
            
            # إنشاء قائمة جديدة بدون السجلات الخاصة بالمستودع المحدد
            new_reorder_levels = []
            for reorder in item_doc.get("reorder_levels", []):
                if reorder.warehouse != self.request_for:
                    new_reorder_levels.append(reorder)
            
            # مسح الجدول وإعادة إضافة السجلات المتبقية
            item_doc.set("reorder_levels", new_reorder_levels)
            
            # حفظ التغييرات
            item_doc.save()
            items_processed += 1
        
        frappe.msgprint(f"تم إزالة إعدادات إعادة الطلب لـ {items_processed} صنف من المستودع {self.request_for}")
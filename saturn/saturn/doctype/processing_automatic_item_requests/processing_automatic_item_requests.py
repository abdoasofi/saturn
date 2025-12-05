# Copyright (c) 2025, Asofi and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import date_diff, getdate
import math

class ProcessingAutomaticItemRequests(Document):
    def validate(self):
        self.calculate_number_of_days()
    
    def calculate_number_of_days(self):
        """احتساب عدد الأيام بين from و to"""
        if self.from_date and self.to_date:
            from_date = getdate(self.from_date)
            to_date = getdate(self.to_date)
            
            if to_date < from_date:
                frappe.throw("To Date cannot be before From Date")
            
            self.number_of_days = date_diff(to_date, from_date) + 1
    
    @frappe.whitelist()
    def get_items(self):
        """جلب جميع الأصناف من مجموعة الأصناف المحددة"""
        if not self.item_group:
            frappe.throw("Please select Item Group")
        
        if not self.from_date or not self.to_date:
            frappe.throw("Please select From and To dates")
        
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
        for item in items:
            outflow_qty = self.get_item_quantity_in_stores(item.item_code)
            if outflow_qty > 0:
                row = self.append("automated_item_request_processing_schedule", {})
                row.item = item.item_code
                # هنا نقوم بتعيين outflow_qty يدوياً ثم نستدعي calculate_row_values
                row.outflow_qty = outflow_qty
                self.calculate_row_values(row)
        
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
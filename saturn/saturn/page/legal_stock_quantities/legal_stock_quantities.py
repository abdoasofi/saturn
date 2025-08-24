import frappe

# **كانت هذه الدالة مفقودة في الكود الذي أرسلته*
@frappe.whitelist()
def get_company_info():
    # 1. جلب اسم الشركة الافتراضية
    default_company = frappe.defaults.get_user_default("company")
    if not default_company:
        default_company = frappe.db.get_single_value("Global Defaults", "default_company")

    if not default_company:
        frappe.throw("No default company is set.")

    # 2. جلب اسم Letter Head المرتبط بالشركة
    letter_head_name = frappe.db.get_value("Company", default_company, "default_letter_head")

    logo_url = ""
    if letter_head_name:
        logo_url = frappe.db.get_value("Letter Head", letter_head_name, "image")

    # 3. إذا لم يوجد شعار، نجرب نجيبه من Website Settings
    if not logo_url:
        logo_url = frappe.db.get_single_value("Website Settings", "app_logo")

    return {
        "company_name": default_company,
        "logo_url": logo_url or ""
    }


@frappe.whitelist()
def get_item_details_and_stock(scanned_value):
    
    item_code = None
    if frappe.db.exists("Item", scanned_value):
        item_code = scanned_value
    else:
        item_code = frappe.db.get_value("Item Barcode", {"barcode": scanned_value}, "parent")

    if not item_code:
        return None 
        
    item = frappe.get_doc("Item", item_code)
    
    details = {
        'item_code': item.item_code,
        'saturn_code': item.get('saturn_code'),
        'sku': item.get('sku'),
        'item_name': item.item_name,
        'description': item.description,
        'item_group': item.item_group,
        'image': item.image,
        'EN_DETAIL_SHOWROOM': frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": "EN-DETAIL SHOWROOM"}, "price_list_rate") or 0,
        'EN_GROSS': frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": "EN-GROSS"}, "price_list_rate") or 0,
        'legal_quantity': item.get('quantity_sku') or 0
    }
    
    # --- التغيير الرئيسي هنا ---
    # نستخدم SUM() لتجميع الكميات الفعلية ونعطيها اسماً مستعاراً 'total_actual_qty'
    total_stock = frappe.db.sql("""
        SELECT
            SUM(bin.actual_qty) as total_actual_qty 
        FROM `tabBin` AS bin
        JOIN `tabWarehouse` AS wh ON bin.warehouse = wh.name
        WHERE 
            bin.item_code = %(item_code)s 
            AND bin.actual_qty > 0 
            AND wh.custom_in_item_details_viewer = 1
    """, {'item_code': item_code}, as_dict=True)
    
    # استعلام SQL سيعيد قائمة تحتوي على عنصر واحد (أو لا شيء)
    # [ {'total_actual_qty': 150.0} ]  أو  [ {'total_actual_qty': None} ]
    
    # نستخرج القيمة ونعطيها قيمة افتراضية 0 إذا كانت النتيجة فارغة
    total_actual_qty = total_stock[0].get('total_actual_qty') if total_stock and total_stock[0] else 0
    
    # نعيد البيانات بتنسيق جديد وبسيط
    return {
        'details': details,
        'stock_levels': {
            'total_actual_qty': total_actual_qty or 0
        }
    }
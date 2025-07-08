import frappe
from frappe import _
# الدالة الجديدة لجلب معلومات الشركة
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

# الدالة الحالية تبقى كما هي
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
    EN_GROSS = frappe.db.get_value("Item Price", {"item_code": item_code, "selling": 1 , "price_list": "EN-GROSS"}, "price_list_rate") or 0
    EN_DETAIL_SHOWROOM = frappe.db.get_value("Item Price", {"item_code": item_code, "selling": 1 , "price_list": "EN-DETAIL SHOWROOM"}, "price_list_rate") or 0
    details = {
        'item_code': item.item_code,
        'saturn_code': item.get('saturn_code'),
        'sku': item.get('sku'),
        'item_name': item.item_name,
        'description': item.description,
        'item_group': item.item_group,
        'image': item.image,
        'EN_DETAIL_SHOWROOM': EN_DETAIL_SHOWROOM,
        'EN_GROSS': EN_GROSS
    }
    stock_levels = frappe.db.sql("""
        SELECT
            bin.warehouse, 
            bin.actual_qty 
        FROM 
            `tabBin` AS bin
        JOIN 
            `tabWarehouse` AS wh ON bin.warehouse = wh.name
        WHERE 
            bin.item_code = %(item_code)s 
            AND bin.actual_qty > 0 
            AND wh.custom_in_item_details_viewer = 1
        ORDER BY 
            bin.warehouse ASC
    """, {'item_code': item_code}, as_dict=True)
    return {'details': details, 'stock_levels': stock_levels}
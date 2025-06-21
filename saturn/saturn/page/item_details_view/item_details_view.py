import frappe

@frappe.whitelist()
def get_item_details_and_stock(scanned_value):
    """
    Finds an item by its Barcode or Item Code and returns its details and stock levels.
    """
    item_code = None

    # 1. First, check if the scanned value is a direct Item Code.
    if frappe.db.exists("Item", scanned_value):
        item_code = scanned_value
    else:
        # 2. If not, check if it's a barcode in the "Item Barcode" child table.
        # The 'parent' field in the child table is the Item Code.
        item_code = frappe.db.get_value("Item Barcode", {"barcode": scanned_value}, "parent")

    # 3. If no item was found by either method, throw an error.
    if not item_code:
        frappe.throw(f"لم يتم العثور على صنف مطابق للكود أو الباركود '{scanned_value}'", title="غير موجود")

    # --- From here, the rest of the function proceeds as before, using the found item_code ---

    item = frappe.get_doc("Item", item_code)
    
    details = {
        'item_code': item.item_code,
        'item_name': item.item_name,
        'description': item.description,
        'item_group': item.item_group,
        'image': item.image,
        'standard_selling_rate': frappe.db.get_value("Item Price", {"item_code": item_code, "selling": 1}, "price_list_rate") or 0
    }

    stock_levels = frappe.db.sql("""
        SELECT warehouse, actual_qty
        FROM `tabBin`
        WHERE item_code = %(item_code)s AND actual_qty > 0
        ORDER BY warehouse ASC
    """, {'item_code': item_code}, as_dict=True)

    return {
        'details': details,
        'stock_levels': stock_levels
    }
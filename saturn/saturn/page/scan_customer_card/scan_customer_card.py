import frappe

@frappe.whitelist()
def get_customer_by_card_number(card_number):
    """
    Finds a customer by their loyalty card number.
    Returns the customer's name (ID) if found, otherwise None.
    """
    if not card_number:
        return None

    # We assume the custom field for the card number is 'custom_loyalty_card_number'
    # on the Customer doctype.
    customer_name = frappe.db.get_value(
        "Customer", 
        {"custom_loyalty_card_number": card_number, "disabled": 0},
        "name"
    )
    
    return customer_name
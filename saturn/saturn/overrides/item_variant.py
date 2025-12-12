import json
import frappe
from frappe import _

@frappe.whitelist()
def get_variant(template, args=None, variant=None, manufacturer=None, manufacturer_part_no=None):
    """Modified function to validate group_number"""
    # Validate group_number exists
    validate_group_number_for_variant_creation(template, args)
    
    # Import original function
    from erpnext.controllers.item_variant import get_variant as original_function
    
    # Call original function
    return original_function(template, args, variant, manufacturer, manufacturer_part_no)

@frappe.whitelist()
def create_variant(item, args, use_template_image=False):
    """Modified function to create variant"""
    use_template_image = frappe.parse_json(use_template_image)
    
    # Validate group_number exists
    validate_group_number_for_variant_creation(item, args)
    
    # Import original function
    from erpnext.controllers.item_variant import create_variant as original_function
    
    if isinstance(args, str):
        args = json.loads(args)
    
    # Call original function
    variant = original_function(item, args, use_template_image)
    
    # Create saturn_code for Variant
    from .item import generate_saturn_code_for_variant
    saturn_code = generate_saturn_code_for_variant(item, variant.name)
    variant.saturn_code = saturn_code
    
    return variant

@frappe.whitelist()
def enqueue_multiple_variant_creation(item, args, use_template_image=False):
    """Modified function to create multiple variants"""
    use_template_image = frappe.parse_json(use_template_image)
    
    # Validate group_number exists
    validate_group_number_for_variant_creation(item, args)
    
    # Import original function
    from erpnext.controllers.item_variant import enqueue_multiple_variant_creation as original_function
    
    # Call original function
    return original_function(item, args, use_template_image)

@frappe.whitelist()
def create_variant_doc_for_quick_entry(template, args):
    """Modified function for Quick Entry"""
    # Validate group_number exists
    validate_group_number_for_variant_creation(template, args)
    
    # Import original function
    from erpnext.controllers.item_variant import create_variant_doc_for_quick_entry as original_function
    
    # Call original function
    variant_dict = original_function(template, args)
    
    # Add saturn_code
    if variant_dict and 'name' in variant_dict:
        from .item import generate_saturn_code_for_variant
        saturn_code = generate_saturn_code_for_variant(template, variant_dict['name'])
        variant_dict['saturn_code'] = saturn_code
    
    return variant_dict

def validate_group_number_for_variant_creation(template, args=None):
    """Validate that group_number exists in parent item"""
    if not template:
        return
    
    parent_item = frappe.get_doc("Item", template)
    
    if not parent_item.get("group_number"):
        frappe.throw(_("You must enter Group Number for parent item '{0}' before creating variants").format(template))
    
    try:
        int(parent_item.group_number)
    except (ValueError, TypeError):
        frappe.throw(_("Group Number must be an integer"))
    
    return parent_item
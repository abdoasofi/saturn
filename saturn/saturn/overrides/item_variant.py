import json
import frappe
from frappe import _

@frappe.whitelist()
def get_variant(template, args=None, variant=None, manufacturer=None, manufacturer_part_no=None):
    """الدالة المعدلة للتحقق من group_number"""
    # التحقق من وجود group_number
    validate_group_number_for_variant_creation(template, args)
    
    # استيراد الدالة الأصلية
    from erpnext.controllers.item_variant import get_variant as original_function
    
    # استدعاء الدالة الأصلية
    return original_function(template, args, variant, manufacturer, manufacturer_part_no)

@frappe.whitelist()
def create_variant(item, args, use_template_image=False):
    """الدالة المعدلة لإنشاء variant"""
    use_template_image = frappe.parse_json(use_template_image)
    
    # التحقق من وجود group_number
    validate_group_number_for_variant_creation(item, args)
    
    # استيراد الدالة الأصلية
    from erpnext.controllers.item_variant import create_variant as original_function
    
    if isinstance(args, str):
        args = json.loads(args)
    
    # استدعاء الدالة الأصلية
    variant = original_function(item, args, use_template_image)
    
    # إنشاء saturn_code للـ Variant
    from .item import generate_saturn_code_for_variant
    saturn_code = generate_saturn_code_for_variant(item, variant.name)
    variant.saturn_code = saturn_code
    
    return variant

@frappe.whitelist()
def enqueue_multiple_variant_creation(item, args, use_template_image=False):
    """الدالة المعدلة لإنشاء multiple variants"""
    use_template_image = frappe.parse_json(use_template_image)
    
    # التحقق من وجود group_number
    validate_group_number_for_variant_creation(item, args)
    
    # استيراد الدالة الأصلية
    from erpnext.controllers.item_variant import enqueue_multiple_variant_creation as original_function
    
    # استدعاء الدالة الأصلية
    return original_function(item, args, use_template_image)

@frappe.whitelist()
def create_variant_doc_for_quick_entry(template, args):
    """الدالة المعدلة للـ Quick Entry"""
    # التحقق من وجود group_number
    validate_group_number_for_variant_creation(template, args)
    
    # استيراد الدالة الأصلية
    from erpnext.controllers.item_variant import create_variant_doc_for_quick_entry as original_function
    
    # استدعاء الدالة الأصلية
    variant_dict = original_function(template, args)
    
    # إضافة saturn_code
    if variant_dict and 'name' in variant_dict:
        from .item import generate_saturn_code_for_variant
        saturn_code = generate_saturn_code_for_variant(template, variant_dict['name'])
        variant_dict['saturn_code'] = saturn_code
    
    return variant_dict

def validate_group_number_for_variant_creation(template, args=None):
    """التحقق من وجود group_number في الصنف الأب"""
    if not template:
        return
    
    parent_item = frappe.get_doc("Item", template)
    
    if not parent_item.get("group_number"):
        frappe.throw(_("يجب إدخال Group Number للصنف الأب '{0}' قبل إنشاء الأصناف المشتقة").format(template))
    
    try:
        int(parent_item.group_number)
    except (ValueError, TypeError):
        frappe.throw(_("Group Number يجب أن يكون رقماً صحيحاً"))
    
    return parent_item
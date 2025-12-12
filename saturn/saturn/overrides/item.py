import frappe
from frappe import _
import re

class ItemOverrides(frappe.model.document.Document):
    def validate_variant_based_on_change(self):
        """Override original validation to allow creating derived items"""
        # If the item is new (being created), no need to validate
        if self.is_new():
            return
        
        # If the item is a variant, don't apply validation
        if self.variant_of:
            return
        
        # If the item is a parent (has variants), validate only if there's a real change
        if self.has_variants:
            # Get previous value from database
            previous_value = frappe.db.get_value("Item", self.name, "variant_based_on")
            
            # If current value is different from previous and there are existing variants
            if self.variant_based_on != previous_value:
                # Check if there are already existing variants
                existing_variants = frappe.get_all("Item", 
                    filters={"variant_of": self.name},
                    limit=1
                )
                
                if existing_variants:
                    frappe.throw(_("Variant Based On cannot be changed once variants are created"))

def validate(doc, method):
    """Validate data before saving"""
    # If this item is a variant, ensure the parent item has group_number
    if doc.variant_of:
        parent = frappe.get_doc("Item", doc.variant_of)
        if not parent.get("group_number"):
            frappe.throw(_("You must enter Group Number for parent item {0} before creating variants").format(
                doc.variant_of
            ))
    
    # Validate that group_number is an integer if it exists
    if doc.get("group_number"):
        try:
            int(doc.group_number)
        except (ValueError, TypeError):
            frappe.throw(_("Group Number must be an integer"))

def before_insert(doc, method):
    """Before inserting a new item"""
    # If this item is a variant, generate saturn_code
    if doc.variant_of:
        saturn_code = generate_saturn_code_for_variant(doc.variant_of, doc.name)
        if saturn_code:
            doc.saturn_code = saturn_code

def after_insert(doc, method):
    """After inserting a new item"""
    if doc.variant_of and not doc.saturn_code:
        try:
            saturn_code = generate_saturn_code_for_variant(doc.variant_of, doc.name)
            if saturn_code:
                frappe.db.set_value("Item", doc.name, "saturn_code", saturn_code)
                frappe.db.commit()
        except Exception as e:
            frappe.log_error(f"Failed to create saturn_code for item {doc.name}: {str(e)}")

def generate_saturn_code_for_variant(template, variant_name=None):
    """Generate saturn_code for variant item"""
    parent_item = frappe.get_doc("Item", template)
    
    if not parent_item.get("group_number"):
        frappe.throw(_("You must enter Group Number for parent item '{0}'").format(template))
    
    group_number = str(parent_item.group_number)
    abbreviation = generate_abbreviation(parent_item.item_name)
    
    last_sequence = get_last_sequence(group_number, abbreviation, template)
    new_sequence = last_sequence + 1
    
    saturn_code = f"{group_number}{abbreviation}-{str(new_sequence).zfill(3)}"
    
    # Ensure the code is unique
    counter = 1
    while frappe.db.exists("Item", {"saturn_code": saturn_code}):
        if variant_name and frappe.db.get_value("Item", variant_name, "saturn_code") == saturn_code:
            break
        
        new_sequence = last_sequence + counter
        saturn_code = f"{group_number}{abbreviation}-{str(new_sequence).zfill(3)}"
        counter += 1
        
        if counter > 1000:
            frappe.throw(_("Failed to create unique Saturn Code"))
    
    return saturn_code

def generate_abbreviation(item_name):
    """Generate abbreviation from item name"""
    if not item_name:
        return "XXX"
    
    clean_name = re.sub(r'[^\w\s]', '', item_name).strip()
    words = [word for word in clean_name.split() if word]
    
    if not words:
        return "XXX"
    
    if len(words) == 1:
        word = words[0]
        if len(word) >= 3:
            return word[:3].upper()
        else:
            return word.upper().ljust(3, 'X')
    else:
        first_char = words[0][0].upper() if words[0] else "X"
        last_char = words[-1][-1].upper() if words[-1] else "X"
        return first_char + last_char

def get_last_sequence(group_number, abbreviation, template):
    """Get the last used sequence number"""
    pattern = f"{group_number}{abbreviation}-%"
    
    variants = frappe.get_all("Item",
        filters={
            "variant_of": template,
            "saturn_code": ("like", pattern)
        },
        fields=["saturn_code"]
    )
    
    last_sequence = 0
    for variant in variants:
        if variant.saturn_code:
            try:
                sequence_part = variant.saturn_code.split("-")[-1]
                sequence = int(sequence_part)
                if sequence > last_sequence:
                    last_sequence = sequence
            except (ValueError, IndexError):
                continue
    
    return last_sequence
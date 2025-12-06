import frappe
from frappe import _
import re

def validate(doc, method):
    """التحقق من البيانات قبل الحفظ"""
    # إذا كان هذا الصنف هو variant، تأكد من أن الصنف الأب لديه group_number
    if doc.variant_of:
        parent = frappe.get_doc("Item", doc.variant_of)
        if not parent.get("group_number"):
            frappe.throw(_("يجب إدخال Group Number للصنف الأب {0} قبل إنشاء الأصناف المشتقة").format(
                doc.variant_of
            ))
    
    # إذا كان هذا الصنف هو أب (لديه variants) وتحقق من group_number إذا كان مطلوبًا
    if doc.get("has_variants") and not doc.get("group_number"):
        # لا نطلب group_number للأب إلا إذا كان سينشئ variants
        pass

def before_insert(doc, method):
    """قبل إدخال صنف جديد"""
    # إذا كان هذا الصنف هو variant، قم بتوليد saturn_code
    if doc.variant_of:
        saturn_code = generate_saturn_code_for_variant(doc.variant_of, doc.name)
        if saturn_code:
            doc.saturn_code = saturn_code

def generate_saturn_code_for_variant(template, variant_name=None):
    """إنشاء saturn_code للصنف المشتق"""
    parent_item = frappe.get_doc("Item", template)
    
    if not parent_item.get("group_number"):
        frappe.throw(_("يجب إدخال Group Number للصنف الأب '{0}'").format(template))
    
    group_number = str(parent_item.group_number)
    abbreviation = generate_abbreviation(parent_item.item_name)
    
    last_sequence = get_last_sequence(group_number, abbreviation, template)
    new_sequence = last_sequence + 1
    
    saturn_code = f"{group_number}{abbreviation}-{str(new_sequence).zfill(3)}"
    
    # التأكد من أن الكود فريد
    counter = 1
    while frappe.db.exists("Item", {"saturn_code": saturn_code}):
        if variant_name and frappe.db.get_value("Item", variant_name, "saturn_code") == saturn_code:
            break
        
        new_sequence = last_sequence + counter
        saturn_code = f"{group_number}{abbreviation}-{str(new_sequence).zfill(3)}"
        counter += 1
        
        if counter > 1000:
            frappe.throw(_("تعذر إنشاء Saturn Code فريد"))
    
    return saturn_code

def generate_abbreviation(item_name):
    """إنشاء اختصار من اسم الصنف"""
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
    """الحصول على آخر تسلسل مستخدم"""
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
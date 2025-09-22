import frappe
import qrcode
import base64
import io
from frappe import _
# from frappe.utils.pdf import get_pdf
from frappe.utils import add_days, cint, flt, nowdate, today
from frappe.core.doctype.communication.email import make

from erpnext.accounts.doctype.loyalty_program.loyalty_program import get_loyalty_program_details_with_points, validate_loyalty_points
from erpnext.accounts.doctype.loyalty_point_entry.loyalty_point_entry import get_loyalty_point_entries, get_redemption_details

# --- Event Hooks ---
def so_before_validate(doc, method):
    # نستخدم أسماء الحقول المخصصة هنا
    if doc.custom_redeem_loyalty_points and doc.loyalty_points > 0:
        # إذا تم تحديد استبدال النقاط، تأكد من أن قيمة الخصم مطابقة لقيمة النقاط
        lp_details = get_loyalty_program_details_with_points(doc.customer, doc.loyalty_program, doc.company)
        
        if lp_details and lp_details.conversion_factor:
            # نستخدم الحقل القياسي loyalty_points والحقل المخصص custom_loyalty_amount
            expected_discount = flt(doc.loyalty_points * lp_details.conversion_factor, doc.precision("discount_amount"))
            
            # تطبيق الخصم في الخادم
            doc.apply_discount_on = "Grand Total"
            doc.discount_amount = expected_discount
            
            # إعادة حساب الإجماليات في الخادم قبل التحقق
            doc.run_method("calculate_taxes_and_totals")

            # الآن نقوم بالتحقق باستخدام الدالة القياسية
            validate_loyalty_points(doc, doc.loyalty_points)
    
    # **THIS IS THE FIX**
    # إذا تم إلغاء استبدال النقاط، قم بإزالة الخصم
    # نستخدم flt() لتحويل القيمة إلى رقم قبل المقارنة
    elif not doc.custom_redeem_loyalty_points and flt(doc.discount_amount) > 0:
         # هذا الشرط يفترض أن الخصم الوحيد هو من النقاط.
         doc.discount_amount = 0
         doc.run_method("calculate_taxes_and_totals")

def so_on_submit(doc, method):
    if doc.custom_redeem_loyalty_points and doc.loyalty_points > 0:
        apply_loyalty_points(doc)
    
    grant_points_on_so_submit(doc)

def so_on_cancel(doc, method):
    revoke_points_on_so_cancel(doc)



# --- منطق منح النقاط ---
def grant_points_on_so_submit(doc):
    if not doc.loyalty_program or doc.grand_total <= 0:
        return

    lp_details = get_loyalty_program_details_with_points(
        doc.customer, loyalty_program=doc.loyalty_program, company=doc.company,
        include_expired_entry=True, current_transaction_amount=doc.grand_total
    )

    if not (lp_details and lp_details.collection_factor > 0):
        return

    # يتم احتساب النقاط على المبلغ الإجمالي مطروحاً منه قيمة النقاط المستبدلة
    eligible_amount = doc.grand_total
    points_earned = cint(eligible_amount / lp_details.collection_factor)
    
    if points_earned > 0:
        lpe = frappe.new_doc("Loyalty Point Entry")
        lpe.loyalty_program = doc.loyalty_program
        lpe.loyalty_program_tier = lp_details.get("tier_name")
        lpe.customer = doc.customer
        lpe.company = doc.company
        lpe.loyalty_points = points_earned
        lpe.purchase_amount = doc.grand_total
        lpe.posting_date = nowdate()
        lpe.invoice_type = "Sales Order"
        lpe.invoice = doc.name
        if lp_details.expiry_duration:
            lpe.expiry_date = add_days(nowdate(), lp_details.expiry_duration)
        
        lpe.insert(ignore_permissions=True)
        lpe.submit()
        
        frappe.db.set_value("Sales Order", doc.name, "custom_points_earned", points_earned, update_modified=False)
        frappe.db.set_value("Sales Order", doc.name, "custom_loyalty_point_entry", lpe.name, update_modified=False)
        set_customer_tier(doc.customer, doc.loyalty_program, doc.company)
        frappe.msgprint(f"Awarded {points_earned} loyalty points.")

# --- منطق استبدال النقاط ---
def apply_loyalty_points(doc):
    # هذا الكود يحاكي دالة apply_loyalty_points في Sales Invoice
    lp_entries_to_redeem_against = get_loyalty_point_entries(doc.customer, doc.loyalty_program, doc.company)
    redemption_details = get_redemption_details(doc.customer, doc.loyalty_program, doc.company)
    
    points_to_redeem = doc.loyalty_points
    for lp_entry in lp_entries_to_redeem_against:
        available_points = lp_entry.loyalty_points - flt(redemption_details.get(lp_entry.name))
        
        redeemed_points = min(available_points, points_to_redeem)

        if redeemed_points > 0:
            lpe = frappe.new_doc("Loyalty Point Entry")
            lpe.loyalty_program = doc.loyalty_program
            lpe.loyalty_program_tier = lp_entry.loyalty_program_tier
            lpe.customer = doc.customer
            lpe.company = doc.company
            lpe.loyalty_points = -abs(redeemed_points) # قيمة سالبة
            lpe.redeem_against = lp_entry.name # الربط بسجل الاكتساب
            lpe.invoice_type = "Sales Order"
            lpe.invoice = doc.name
            lpe.purchase_amount = doc.grand_total
            lpe.posting_date = nowdate()
            lpe.insert(ignore_permissions=True)
            lpe.submit()
            
            points_to_redeem -= redeemed_points
            if points_to_redeem < 1:
                break

# --- منطق إلغاء النقاط (مُصحح) ---
def revoke_points_on_so_cancel(doc):
    # البحث عن كل سجلات النقاط (اكتساب أو استبدال) المرتبطة بأمر المبيعات هذا
    linked_entries = frappe.get_all("Loyalty Point Entry", filters={"invoice": doc.name, "invoice_type": "Sales Order", "docstatus": 1})
    
    for entry in linked_entries:
        try:
            lpe_doc = frappe.get_doc("Loyalty Point Entry", entry.name)
            lpe_doc.cancel() # نقوم بإلغاء السجل بدلاً من حذفه
            frappe.msgprint(f"Cancelled Loyalty Point Entry: {entry.name}")
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Failed to cancel LPE {entry.name}")
    
    set_customer_tier(doc.customer, doc.loyalty_program, doc.company)


# --- Helper Function to update customer tier ---
def set_customer_tier(customer, loyalty_program, company):
    # هذه الدالة تحاكي ما تفعله دالة set_loyalty_program_tier في Sales Invoice
    lp_details = get_loyalty_program_details_with_points(
        customer,
        loyalty_program=loyalty_program,
        company=company,
        include_expired_entry=True
    )
    if lp_details and lp_details.get("tier_name"):
        frappe.db.set_value("Customer", customer, "loyalty_program_tier", lp_details.get("tier_name"))

@frappe.whitelist()
def generate_card_number_for_customer(customer_name):
    """
    Generates a new loyalty card number for a customer using a custom series logic.
    Format: CARD-00001
    """
    customer = frappe.get_doc("Customer", customer_name)
    
    # تحقق مرة أخرى للتأكد من عدم وجود رقم بالفعل
    if customer.custom_loyalty_card_number:
        return customer.custom_loyalty_card_number

    # 1. تحديد البادئة
    prefix = "CARD-"
    
    # 2. البحث عن آخر رقم تم استخدامه
    last_card_number = frappe.db.get_value(
        "Customer",
        filters={"custom_loyalty_card_number": ["like", f"{prefix}%"]},
        fieldname="custom_loyalty_card_number",
        # order_by="creation DESC"
    )
    print("*"*50,last_card_number)
    
    # 3. استخراج الرقم وزيادته
    if last_card_number:
        try:
            # حاول استخراج الجزء الرقمي من آخر رقم
            last_number = int(last_card_number.replace(prefix, ""))
            print("*-"*50,last_number)
            new_number = last_number + 1
            print("*/"*50,new_number)
        except ValueError:
            # في حال كان الرقم القديم غير صالح، ابدأ من 1
            new_number = 1
    else:
        # إذا لم يتم العثور على أي رقم سابق، ابدأ من 1
        new_number = 1
        
    # 4. تنسيق الرقم الجديد (5 خانات مع أصفار بادئة)
    # مثلاً: 1 -> 00001, 123 -> 00123
    new_card_number = f"{prefix}{new_number:05d}"
    print("*#"*50,new_card_number)
    
    # 5. احفظ الرقم الجديد في حقل العميل
    customer.custom_loyalty_card_number = new_card_number
    customer.save(ignore_permissions=True)
    
    return new_card_number

@frappe.whitelist()
def send_loyalty_card_email(customer_name, loyalty_email):
    customer = frappe.get_doc("Customer", customer_name)
    card_number = customer.custom_loyalty_card_number or generate_card_number_for_customer(customer_name)
    if not card_number: 
        customer.reload()
        card_number = customer.custom_loyalty_card_number

    if not loyalty_email or not frappe.utils.validate_email_address(loyalty_email):
        frappe.throw(_("Please provide a valid email address."))

    # Generate QR image and Base64 data URL
    img_buffer = io.BytesIO()
    qrcode.make(card_number).save(img_buffer, format="PNG")
    qr_image_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
    qr_image_data_url = f"data:image/png;base64,{qr_image_base64}"

    # Prepare context
    company_name = frappe.defaults.get_global_default("company")
    company_doc = frappe.get_doc("Company", company_name)
    context = {
        'customer_name': customer.customer_name,
        'card_number': card_number,
        'company_name': company_doc.name,
        'company_logo': company_doc.company_logo,
        'current_year': today()[0:4],
        'qr_image_url': qr_image_data_url
    }

    # Render template
    subject = _("Your Digital Loyalty Card from {0}").format(company_name)
    message_html = frappe.render_template("templates/emails/loyalty_card.html", context)

    # --- THIS IS THE FINAL, ROBUST SOLUTION ---
    # We use frappe.core.doctype.communication.email.make to build the email
    # This gives us more control and avoids auto-formatting issues.
    email_content = make(
        recipients=[loyalty_email],
        subject=subject,
        content=message_html,
        send_email=True  # This will send it immediately
    )
    
    # The 'make' function returns a Communication doc, but we don't need to do anything with it.
    # It handles queuing and sending.

    return _("Loyalty card has been sent successfully to {0}").format(loyalty_email)

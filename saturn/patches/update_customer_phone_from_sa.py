import frappe

def execute():
    """
    Finds the latest Sales Order for each customer that has a phone number,
    and updates the 'custom_phone_number' field on the Customer doctype.
    """
    # frappe.reload_doc("Contacts", "doctype", "customer")
    # frappe.reload_doc("Selling", "doctype", "sales_order")

    # أولاً، تحقق من وجود الحقول المخصصة لتجنب الأخطاء
    if not frappe.db.has_column("Customer", "custom_phone_number"):
        frappe.log_error(
            "Patch: update_customer_phone_from_so",
            "Custom field 'custom_phone_number' not found in Customer doctype. Skipping patch."
        )
        return

    # افترض أن اسم حقل الهاتف في Sales Order هو 'custom_phone_number' أو 'contact_phone'
    # إذا كان اسم الحقل المخصص مختلفاً، قم بتغييره هنا
    phone_field_in_so = "custom_phone_number" # أو "contact_phone" أو اسم حقلك المخصص
    
    if not frappe.db.has_column("Sales Order", phone_field_in_so):
        frappe.log_error(
            "Patch: update_customer_phone_from_so",
            f"Field '{phone_field_in_so}' not found in Sales Order doctype. Skipping patch."
        )
        return

    # جلب أحدث رقم هاتف لكل عميل من أوامر المبيعات المعتمدة
    # نستخدم `creation DESC` للحصول على أحدث سجل لكل عميل
    sales_orders_with_phone = frappe.get_all(
        "Sales Order",
        filters={
            # "docstatus": 1,
            phone_field_in_so: ["is", "set"],
            "customer": ["is", "set"]
        },
        fields=["customer", phone_field_in_so]
        # order_by="creation DESC"
    )

    if not sales_orders_with_phone:
        print("No Sales Orders with phone numbers found to update customers.")
        return

    customers_updated = {}
    updated_count = 0
    
    print(f"Found {len(sales_orders_with_phone)} Sales Orders to process...")

    for so in sales_orders_with_phone:
        customer_name = so.get("customer")
        phone_number = so.get(phone_field_in_so)

        # تحقق مما إذا كنا قد قمنا بتحديث هذا العميل بالفعل
        if customer_name in customers_updated:
            continue
            
        try:
            # قم بتحديث حقل الهاتف في مستند العميل
            frappe.db.set_value(
                "Customer",                 # DocType
                customer_name,              # Document Name
                "custom_phone_number",      # Field to update
                phone_number                # New value
            )
            customers_updated[customer_name] = phone_number
            updated_count += 1
            print(f"Updated Customer '{customer_name}' with phone number '{phone_number}'.")

        except frappe.DoesNotExistError:
            # في حال كان العميل محذوفاً أو غير موجود
            print(f"Customer '{customer_name}' not found. Skipping.")
        except Exception as e:
            # لأي أخطاء أخرى
            print(f"Failed to update customer '{customer_name}'. Error: {e}")
    
    # لا تنس عمل commit لحفظ التغييرات في قاعدة البيانات
    frappe.db.commit()
    
    print(f"--- Patch Complete ---")
    print(f"Successfully updated {updated_count} customers.")
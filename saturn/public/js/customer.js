frappe.ui.form.on('Customer', {
    refresh: function(frm) {
        // أزل أي زر قديم إذا كان موجوداً
        if(frm.custom_buttons["Print Loyalty Card"]) {
            frm.custom_buttons["Print Loyalty Card"].remove();
        }

        // أضف الزر الجديد
        frm.add_custom_button(__('Print Loyalty Card'), function() {
            if (frm.doc.custom_loyalty_card_number) {
                // إذا كان لديه كرت، اطبعه مباشرة
                frappe.set_route('print', 'Customer', frm.doc.name, {
                    print_format: 'Loyalty Card'
                });
            } else {
                // إذا لم يكن لديه، قم بتوليد رقم جديد ثم اطبعه
                frappe.call({
                    method: 'saturn.loyalty_program_extension.generate_card_number_for_customer',
                    args: {
                        customer_name: frm.doc.name
                    },
                    freeze: true,
                    freeze_message: __("Generating card number..."),
                    callback: function(r) {
                        if (!r.exc) {
                            // أعد تحميل المستند لإظهار الرقم الجديد ثم اطبعه
                            frm.reload_doc().then(() => {
                                frappe.show_alert({message: __("Card generated! Preparing print..."), indicator: 'green'});
                                frappe.set_route('print', 'Customer', frm.doc.name, {
                                    print_format: 'Loyalty Card'
                                });
                            });
                        }
                    }
                });
            }
        });
        // --- الزر الجديد: إرسال عبر البريد الإلكتروني ---
        frm.add_custom_button(__('Send Card by Email'), function() {
            // 1. تحقق من وجود البريد الإلكتروني
            if (!frm.doc.custom_loyalty_card_email) {
                frappe.msgprint({
                    title: __('Email Required'),
                    message: __('Please enter a "Loyalty Card Email" for this customer first.'),
                    indicator: 'orange'
                });
                frm.set_focus('custom_loyalty_card_email');
                return;
            }

            // 2. استدعاء دالة الخادم
            frappe.call({
                method: 'saturn.loyalty_program_extension.send_loyalty_card_email',
                args: {
                    customer_name: frm.doc.name,
                    loyalty_email: frm.doc.custom_loyalty_card_email
                },
                freeze: true,
                freeze_message: __("Sending email..."),
                callback: function(r) {
                    if (!r.exc) {
                        frappe.show_alert({message: r.message, indicator: 'green'});
                        frm.reload_doc(); // أعد التحميل إذا تم توليد رقم كرت جديد
                    }
                }
            });
        });        
    }
});
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
    }
});
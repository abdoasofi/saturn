frappe.ui.form.on('Sales Order', {
    onload(frm) {
        set_user_naming_series(frm);
    },
    refresh(frm) {
        set_user_naming_series(frm);
    },    
    setup: function(frm) {
        frm.loyalty_details = {};
    },

    customer: function(frm) {
        // عند تغيير العميل، أعد تصفير كل شيء وانتظر حتى يتم جلب البيانات الجديدة
        frm.set_value('custom_redeem_loyalty_points', 0);
        frm.set_value('loyalty_points', 0);
        frm.set_value('loyalty_amount', 0);
        frm.set_value('discount_amount', 0); // مهم: أعد تصفير الخصم
    },

    custom_redeem_loyalty_points: function(frm) {
        if (frm.doc.custom_redeem_loyalty_points) {
            if (!frm.doc.customer) {
                frappe.msgprint(__("Please select a customer first."));
                frm.set_value('custom_redeem_loyalty_points', 0);
                return;
            }

            // **الحل هنا: تحقق من وجود برنامج الولاء قبل المتابعة**
            if (!frm.doc.loyalty_program) {
                frappe.msgprint(__("This customer is not enrolled in a loyalty program."));
                frm.set_value('custom_redeem_loyalty_points', 0);
                return;
            }

            // الآن نحن متأكدون من أن frm.doc.loyalty_program لديه قيمة
            frappe.call({
                method: "erpnext.accounts.doctype.loyalty_program.loyalty_program.get_loyalty_program_details_with_points",
                args: {
                    customer: frm.doc.customer,
                    company: frm.doc.company,
                    loyalty_program: frm.doc.loyalty_program, // نمرر القيمة بشكل صريح
                    silent: true
                },
                callback: function(r) {
                    if (r.message && r.message.loyalty_points > 0) {
                        frm.loyalty_details = r.message;
                        frm.set_df_property('loyalty_points', 'description', 
                            __("Available Points: {0}", [frm.loyalty_details.loyalty_points]));
                    } else {
                        frappe.msgprint(__("This customer has no loyalty points to redeem."));
                        frm.set_value('custom_redeem_loyalty_points', 0);
                    }
                }
            });
        } else {
            // عند إلغاء التحديد، قم بإزالة الخصم المتعلق بالنقاط
            frm.set_value('loyalty_points', 0);
        }
    },

    loyalty_points: function(frm) {
        // نستخدم نفس المنطق السابق، فهو صحيح
        if (!frm.doc.custom_redeem_loyalty_points) {
            frm.set_value('discount_amount', 0);
            frm.set_value('loyalty_amount', 0);
            frm.events.calculate_taxes_and_totals(frm);
            return;
        };
        
        // قد يستغرق تحميل التفاصيل وقتاً، لذا نضيف تأخيراً بسيطاً
        setTimeout(() => {
            if (frm.loyalty_details && frm.loyalty_details.conversion_factor) {
                if (frm.doc.loyalty_points > frm.loyalty_details.loyalty_points) {
                    frappe.msgprint(__("Points to redeem cannot exceed available points ({0})", [frm.loyalty_details.loyalty_points]));
                    frm.set_value('loyalty_points', frm.loyalty_details.loyalty_points);
                }

                let loyalty_amount = frm.doc.loyalty_points * frm.loyalty_details.conversion_factor;
                frm.set_value('loyalty_amount', loyalty_amount);
                
                frm.set_value('apply_discount_on', 'Grand Total');
                frm.set_value('discount_amount', loyalty_amount);
                
                // استدعاء دالة الحساب القياسية
                // frm.events.calculate_taxes_and_totals(frm);
                
            }
        }, 300);
    },
    
    // دالة قياسية لإعادة الحساب
    // calculate_taxes_and_totals: function(frm) {
	// 	frm.call({
	// 		doc: frm.doc,
	// 		method: "set_taxes",
	// 		callback: function (r) {
	// 			if (!r.exc) {
	// 				frm.refresh_fields();
	// 			}
	// 		},
	// 	});
	// }
});

function set_user_naming_series(frm) {
    // جلب قيمة الحقل من ملف المستخدم الحالي
    frappe.db.get_value('User', frappe.session.user, 'sales_order_naming_series')
    .then(r => {
        const val = r.message ? r.message.sales_order_naming_series : null;
        if (val) {
            // لو القيمة موجودة، اضبط الحقل (لو مختلف) واجعله قراءة فقط
            if (frm.doc.naming_series !== val) {
                frm.set_value('naming_series', val);
            }
            frm.set_df_property('naming_series', 'read_only', 1);
        } else {
            // لو المستخدم ما عنده قيمة، خله قابل للتعديل
            frm.set_df_property('naming_series', 'read_only', 0);
        }
    })
    .catch(() => {
        // في حالة خطأ بسيط، خليه قابل للتعديل بدل ما يكسر الفورم
        frm.set_df_property('naming_series', 'read_only', 0);
    });
}
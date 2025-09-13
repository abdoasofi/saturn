// Copyright (c) 2025, Asofi and contributors
// For license information, please see license.txt

frappe.ui.form.on("Card", {
	onload: function(frm){
		frm.set_query("doctype_card", function(){
			return { filters:{ "issingle": 0 } };
		});
	},

	refresh: function(frm) {
		if (!frm.is_new()) {
			// existing Print Cards button عندك
			frm.add_custom_button(__("Print Cards"), () => {
				frm.events.print_select(frm);
			});
			frm.change_custom_button_type(__("Print Cards"), null, "primary");

			// New: Export DOCX button
			frm.add_custom_button(__("Export DOCX"), function() {
				frappe.call({
					method: "saturn.saturn.doctype.card.card.export_labels_docx",
					args: {
						card_name: frm.doc.name
					},
					callback: function(r) {
						if (r.message && r.message.url) {
							// open the generated file in a new tab (download)
							window.open(r.message.url, "_blank");
						} else {
							frappe.msgprint(__("No file returned from server."));
						}
					}
				});
			}).addClass("btn-primary");
		}
	},
print_select: function(frm){
    frm.selector = new frappe.ui.form.MultiSelectDialog({
        doctype: frm.doc.doctype_card,
        size: "extra-large",
        setters: JSON.parse(frm.doc.fields),
        target: frm,
        add_filters_group: 1,
        data_fields: [{
                fieldname: 'select_all',
                fieldtype: 'Check',
                label: __('Select All'),
                onchange: function() {
                    let select_all = frm.selector.dialog.get_value("select_all");
                    frm.selector.dialog.set_df_property("results_area", "hidden", select_all);
                }
            },
            {
                fieldname: 'starting_value_for_autonumbering',
                fieldtype: 'Int',
                label: __('Starting Value For Autonumbering'),
                "default":1
            },
        ],
        primary_action_label: __("Print"),
        action: function(elements, data){
            // existing print behavior (keep as-is)
            let filters = "";
            if (data.select_all){
                delete data.filtered_children;
                delete data.select_all;
                delete data.starting_value_for_autonumbering;
                filters = JSON.stringify(data);
            } else {
                filters = JSON.stringify({name: ["in", elements]});
            }

            frm._filters = filters;
            frm.trigger("old_set_filters");
            frm.set_value("data",data);
            frappe.call({
                method: "saturn.saturn.doctype.card.card.set_card_filters",
                args: {
                    card_name: frm.doc.name,
                    filters: filters,
                    starting_value_for_autonumbering: frm.selector.dialog.get_value("starting_value_for_autonumbering"),
                },
                callback: function(r){
                    if (! r.exc){
                        frm.print_doc();
                    }
                }
            });
        }
    });

    // بعد إنشاء الديالوج، نضيف زر Export DOCX في نفس مكان زر Print
    // ننتظر قليلًا لضمان أن الـ dialog تم إنشاؤه كاملًا
    setTimeout(function(){
        try {
            // العثور على زر Print في فوتر الديالوج
            let $modal = frm.selector.dialog.$wrapper; // jQuery wrapper
            let $footer = $modal.find(".modal-footer");
            // حاول إيجاد الزر الرئيسي (قد يحمل class btn-primary)
            let $print_btn = $footer.find("button.btn-primary").first();

            // أنشئ زر جديد Export DOCX بعد زر Print
            let $export_btn = $('<button class="btn btn-default">')
                .text(__('Export DOCX'))
                .css({"margin-left": "8px"})
                .on("click", function(ev){
                    ev.preventDefault();
                    // جمع العناصر المختارة — نستخدم أكثر من طريقة احتياطًا

                    // 1) حاول استخدام API الخاص بالdialog (لو موجود)
                    let selected_names = [];
                    try {
                        // Some MultiSelectDialog implementations expose 'get_checked_values' or 'get_selected'
                        if (typeof frm.selector.get_checked_values === "function"){
                            selected_names = frm.selector.get_checked_values();
                        } else if (typeof frm.selector.get_selected_values === "function"){
                            selected_names = frm.selector.get_selected_values();
                        }
                    } catch(e){
                        selected_names = [];
                    }

                    // 2) fallback: اقرأ من الـ DOM داخل results_area (checkboxes)
                    if (!selected_names || selected_names.length === 0){
                        try {
                            // هذه السلكتور قد يختلف حسب إصدار Frappe — تحقق لو لم يعمل
                            let $checked = $modal.find(".results-area input[type='checkbox']:checked");
                            // حاول الحصول على قيمة 'value' أو data-name أو أقرب صف
                            $checked.each(function(){
                                let v = $(this).attr("value") || $(this).data("value") || $(this).attr("data-name");
                                if (!v){
                                    // محاولة استخراج اسم من صف القائمة
                                    let row = $(this).closest(".list-row, tr, .result-row");
                                    if (row && row.length){
                                        // عادة الاسم يكون في أول خلية
                                        v = row.find("td").first().text().trim();
                                    }
                                }
                                if (v) selected_names.push(v);
                            });
                        } catch(e){}
                    }

                    // 3) إذا ما فيه عناصر مختارة — خطأ للمستخدم
                    if (!selected_names || selected_names.length === 0){
                        frappe.msgprint(__("No items selected. Please select items from the list to export."));
                        return;
                    }

                    // الآن استدعي الباك-إند لعمل التصدير عبر أسماء العناصر
                    frappe.call({
                        method: "saturn.saturn.doctype.card.card.export_labels_docx_for_names",
                        args: {
                            card_name: frm.doc.name,
                            names: JSON.stringify(selected_names)
                        },
                        callback: function(res){
                            if (res.message && res.message.url){
                                window.open(res.message.url, "_blank");
                                // يمكنك إغلاق الديالوج لو رغبت:
                                // frm.selector.dialog.hide();
                            } else {
                                frappe.msgprint(__("Export failed or no file returned."));
                            }
                        }
                    });

                });

            // ضع الزر بعد زر الطباعة؛ إن لم يوجد زر طباعة ضع زرنا في الفوتر مباشرة
            if ($print_btn && $print_btn.length){
                $print_btn.after($export_btn);
            } else {
                $footer.append($export_btn);
            }
        } catch(err){
            console.error("Failed to add Export DOCX button to MultiSelectDialog:", err);
        }
    }, 200);
},
//  على الـ JS أعلاه
});

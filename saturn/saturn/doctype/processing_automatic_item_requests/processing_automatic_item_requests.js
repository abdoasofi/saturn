// Copyright (c) 2025, Asofi and contributors
// For license information, please see license.txt

frappe.ui.form.on('Processing Automatic Item Requests', {
    refresh: function(frm) {
        // إضافة زر للتحقق من قيم Reorder
        if (frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Check Reorder Values'), function() {
                frm.trigger('validate_reorder_before_submit');
            });
        }

        // تعيين استعلام الأصناف في الجدول الفرعي بناءً على مجموعة الأصناف المحددة
        if (frm.doc.item_group) {
            frm.fields_dict['automated_item_request_processing_schedule'].grid.get_field('item').get_query = function(doc) {
                return {
                    filters: {
                        'item_group': frm.doc.item_group,
                        'disabled': 0
                    }
                };
            };
        }
    },
    
    item_group: function(frm) {
        // عند تغيير مجموعة الأصناف، نقوم بتحديث استعلام الأصناف في الجدول الفرعي
        if (frm.doc.item_group) {
            frm.fields_dict['automated_item_request_processing_schedule'].grid.get_field('item').get_query = function(doc) {
                return {
                    filters: {
                        'item_group': frm.doc.item_group,
                        'disabled': 0
                    }
                };
            };
        }
    },
   
    from_date: function(frm) {
        frm.trigger('calculate_days');
    },
    
    to_date: function(frm) {
        frm.trigger('calculate_days');
    },
    
    calculate_days: function(frm) {
        if (frm.doc.from_date && frm.doc.to_date) {
            // تحديث عدد الأيام تلقائياً
            frm.save_or_update().then(() => {
                frm.refresh_field('number_of_days');
                // تحديث جميع الصفوف في الجدول
                frm.trigger('update_all_rows');
            });
        }
    },
    
    get_items: function(frm) {
        // استدعاء دالة جلب الأصناف من السيرفر
        frm.call('get_items').then((r) => {
            if (!r.exc) {
                frm.refresh_field('automated_item_request_processing_schedule');
            }
        });
    },
    
    update_all_rows: function(frm) {
        // تحديث جميع الصفوف في الجدول عند تغيير عدد الأيام
        if (frm.doc.automated_item_request_processing_schedule && 
            frm.doc.automated_item_request_processing_schedule.length > 0) {
            
            frm.doc.automated_item_request_processing_schedule.forEach(function(row) {
                if (row.outflow_qty && frm.doc.number_of_days && frm.doc.number_of_days > 0) {
                    row.number_of_days = frm.doc.number_of_days;
                    
                    // إعادة حساب القيم
                    row.daily_withdrawal_rate = row.outflow_qty / frm.doc.number_of_days;
                    row.daily_withdrawal_rate = Math.ceil(row.daily_withdrawal_rate);
                    
                    row.safety_stock = row.daily_withdrawal_rate * row.number_of_days;
                    row.safety_stock = Math.ceil(row.safety_stock);
                    
                    row.warehouse_reorder_level = row.safety_stock;
                    
                    row.warehouse_reorder_qty = row.safety_stock;
                }
            });
            frm.refresh_field('automated_item_request_processing_schedule');
        }
    },
    
    validate_reorder_before_submit: function(frm) {
        // التحقق من عدم وجود صفوف في الجدول الفرعي بقيم reorder تساوي صفر
        var has_zero_values = false;
        var items_with_zero = [];
        
        if (frm.doc.automated_item_request_processing_schedule) {
            frm.doc.automated_item_request_processing_schedule.forEach(function(row) {
                if (row.warehouse_reorder_level == 0 || row.warehouse_reorder_qty == 0) {
                    has_zero_values = true;
                    items_with_zero.push(row.item);
                }
            });
        }
        
        if (has_zero_values) {
            frappe.msgprint({
                title: __('تحذير'),
                indicator: 'orange',
                message: __('الأصناف التالية لديها قيم Reorder تساوي صفر:') + 
                         '<br><br>' + items_with_zero.join('<br>') +
                         '<br><br>' + __('يرجى تعيين قيم مناسبة قبل الاعتماد.')
            });
        } else {
            frappe.msgprint({
                title: __('تم التحقق'),
                indicator: 'green',
                message: __('جميع قيم Reorder صالحة ويمكن اعتماد المستند.')
            });
        }
    }
});

// أحداث للجدول الفرعي
frappe.ui.form.on('Automated Item Request Processing Schedule', {
    item: function(frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        if (row.item) {
            // جلب كمية الصنف من المستودعات المحددة
            frm.call({
                method: 'get_item_quantity_in_stores',
                doc: frm.doc,
                args: {
                    item_code: row.item
                },
                callback: function(r) {
                    if (r.message > 0) {
                        row.outflow_qty = r.message;
                        frm.trigger('calculate_row_values', cdt, cdn);
                    }
                }
            });
        }
    },
    outflow_qty: function(frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        // إعادة حساب القيم
        row.daily_withdrawal_rate = row.outflow_qty / frm.doc.number_of_days;
        row.daily_withdrawal_rate = Math.ceil(row.daily_withdrawal_rate);
    },    
    number_of_days: function(frm, cdt, cdn) {
        frm.trigger('calculate_row_values', cdt, cdn);
    },
    
    calculate_row_values: function(frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        
        if (row.item && frm.doc.number_of_days && frm.doc.number_of_days > 0) {
            // تحديث القيم بناءً على outflow_qty وعدد الأيام
            if (row.outflow_qty) {
                row.safety_stock = row.daily_withdrawal_rate * row.number_of_days;
                
                // تدوير القيمة إلى أقرب عدد صحيح أكبر
                row.safety_stock = Math.ceil(row.safety_stock);
                
                row.warehouse_reorder_level = row.safety_stock;
                row.warehouse_reorder_qty = row.warehouse_reorder_level;
                
                frm.refresh_field('automated_item_request_processing_schedule');
            }
        }
    }    
});
// Copyright (c) 2025, Asofi and contributors
// For license information, please see license.txt

frappe.ui.form.on('Processing Automatic Item Requests', {
    from: function(frm) {
        frm.trigger('calculate_days');
    },
    to: function(frm) {
        frm.trigger('calculate_days');
    },
    
    calculate_days: function(frm) {
        if (frm.doc.from && frm.doc.to) {
            // تحديث عدد الأيام تلقائياً
            frm.save_or_update().then(() => {
                frm.refresh_field('number_of_days');
            });
        }
    },
    
    get_items: function(frm) {
        // استدعاء دالة جلب الأصناف من السيرفر
        frm.call('get_items').then(() => {
            frm.refresh_field('automated_item_request_processing_schedule');
        });
    }
});

// أحداث للجدول الفرعي
frappe.ui.form.on('Automated Item Request Processing Schedule', {
    item: function(frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        if (row.item) {
            frm.trigger('calculate_row_values', cdt, cdn);
        }
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

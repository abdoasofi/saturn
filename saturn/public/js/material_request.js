

frappe.ui.form.on('Material Request', {
    setup(frm) {
        // نُعد الاستعلام مرة واحدة فقط عند تحميل الفورم
        frm.set_query('from_warehouse', 'items', function(doc, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (row && Array.isArray(row._available_warehouses) && row._available_warehouses.length > 0) {
                return {
                    filters: [
                        ['Warehouse', 'name', 'in', row._available_warehouses]
                    ]
                };
            }
            // إذا لم يكن هناك فلتر، اسمح بكل المخازن
            return {}; 
        });
    }
});

frappe.ui.form.on('Material Request Item', {
    item_code: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        
        // إعادة تعيين المخزن والمتغير عند تغيير الصنف
        frappe.model.set_value(cdt, cdn, 'from_warehouse', null);
        row._available_warehouses = []; // مهم: أفرغ الفلتر القديم
        
        if (!row.item_code) {
            return;
        }

        // استدعاء دالة الخادم لجلب المخازن
        frappe.call({
            method: 'saturn.api.get_warehouses_with_stock',
            args: { 
                item_code: row.item_code,
                min_qty: 0 
            },
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    // فقط قم بتحديث المتغير الذي يقرأ منه الاستعلام
                    row._available_warehouses = r.message;
                } else {
                    // إذا لم يكن هناك رصيد، تأكد من أن الفلتر فارغ
                    row._available_warehouses = [];
                    frappe.show_alert({message: `No stock found for item ${row.item_code} in any warehouse.`, indicator: 'warning'});
                }
            }
        });
    }
});
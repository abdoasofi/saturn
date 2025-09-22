
// دالة مساعدة لتعريف الاستعلام الديناميكي. سنستخدمها في عدة أماكن
function set_s_warehouse_query(frm, cdt, cdn) {
    frm.fields_dict.items.grid.get_field('s_warehouse').get_query = function(doc, cdt_grid, cdn_grid) {
        const current_row = locals[cdt_grid][cdn_grid];

        if (current_row && Array.isArray(current_row._available_warehouses) && current_row._available_warehouses.length > 0) {
            return {
                filters: [
                    ['Warehouse', 'name', 'in', current_row._available_warehouses]
                ]
            };
        } else if (current_row && current_row.item_code) {
            // إذا كان هناك صنف ولكن لا توجد مخازن (رصيد صفر)، لا تعرض شيئاً
            return {
                filters: [
                    ['Warehouse', 'name', 'in', []]
                ]
            };
        } else {
            // السلوك الافتراضي: اعرض كل المخازن التي ليست مجموعة
            return {
                filters: [
                    ['Warehouse', 'is_group', '=', 0]
                ]
            };
        }
    };
}


frappe.ui.form.on('Stock Entry', {
    // هذا الحدث يعمل عند تحميل الفورم لأول مرة أو عند تحديثه
    refresh: function(frm) {
        // --- هذا هو الحل للصف الأول ---
        // قم بالمرور على كل الصفوف الموجودة حالياً في الجدول
        frm.doc.items.forEach(function(row) {
            // وقم بتطبيق منطق الاستعلام عليها
            set_s_warehouse_query(frm, row.doctype, row.name);
        });
    }
});


frappe.ui.form.on('Stock Entry Detail', {
    // هذا الحدث يعمل عند إضافة صف جديد
    items_add: function(frm, cdt, cdn) {
        // قم بتطبيق منطق الاستعلام على الصف الجديد
        set_s_warehouse_query(frm, cdt, cdn);
    },

    item_code: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        
        frappe.model.set_value(cdt, cdn, 's_warehouse', null);
        row._available_warehouses = [];
        
        if (!row.item_code) {
            return;
        }

        frappe.call({
            method: 'saturn.api.get_warehouses_with_stock',
            args: { 
                item_code: row.item_code,
                min_qty: 0 
            },
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    row._available_warehouses = r.message;
                } else {
                    row._available_warehouses = [];
                    frappe.show_alert({message: `No stock found for item ${row.item_code} in any warehouse.`, indicator: 'warning'});
                }
            }
        });
    }
});
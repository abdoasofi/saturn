// Copyright (c) 2025, Asofi and contributors
// For license information, please see license.txt

frappe.ui.form.on('Link SKU To Items', {
    refresh: function(frm) {
        // This function runs when the form is loaded or refreshed
    },

    // --- Event for the "Get Items" button ---
    get_items: function(frm) {
        if (!frm.doc.sku) {
            frappe.msgprint(__("Please enter an SKU first."));
            return;
        }

        frappe.call({
            method: 'get_items_by_sku',
            doc: frm.doc,
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    // Clear the existing table
                    frm.clear_table('sku_quantity_the_item');
                    
                    // Add the fetched items to the table
                    r.message.forEach(item => {
                        let row = frm.add_child('sku_quantity_the_item');
                        row.item = item.item;
                        row.sku_quantity = item.sku_quantity;
                    });
                    
                    frm.refresh_field('sku_quantity_the_item');
                    frappe.msgprint(__("Items loaded successfully."));
                } else {
                    frappe.msgprint(__("No items found for this SKU."));
                }
            }
        });
    },

    // --- Event that runs when the SKU field value is changed ---
    sku: function(frm) {
        // Automatically fetch items when SKU is changed
        if (frm.doc.sku) {
            frm.trigger('get_items');
        } else {
            // Clear the table if SKU is cleared
            frm.clear_table('sku_quantity_the_item');
            frm.refresh_field('sku_quantity_the_item');
        }
    },
    
    // --- Event for the "Update SKU in Items" button ---
    update_sku_in_items: function(frm) {
        if (frm.doc.sku_quantity_the_item.length === 0) {
            frappe.msgprint(__("Please load items into the table first."));
            return;
        }
        
        frappe.confirm(__("Are you sure you want to change the SKU for all items in this list to '{0}'?", [frm.doc.sku]), () => {
            frappe.call({
                method: 'update_sku_in_items',
                doc: frm.doc,
                callback: function(r) {
                    // Optional: You can add feedback here if needed
                }
            });
        });
    },

    // --- Event for the "Update Quantities in Items" button ---
    update_quantities_in_items: function(frm) {
        if (frm.doc.sku_quantity_the_item.length === 0) {
            frappe.msgprint(__("Please load items into the table first."));
            return;
        }
        
        frappe.confirm(__("Are you sure you want to update the SKU Quantity for all items in this list?"), () => {
             frappe.call({
                method: 'update_quantities_in_items',
                doc: frm.doc,
                callback: function(r) {
                    // Optional: You can add feedback here if needed
                }
            });
        });
    }
});
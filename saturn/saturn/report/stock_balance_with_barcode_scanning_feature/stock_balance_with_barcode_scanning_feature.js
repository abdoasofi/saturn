// Copyright (c) 2025, Asofi and contributors
// For license information, please see license.txt

frappe.query_reports["Stock Balance With Barcode Scanning Feature"] = {
    filters: [
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "Link",
            width: "80",
            options: "Company",
            default: frappe.defaults.get_default("company"),
        },
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            width: "80",
            reqd: 1,
            default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            width: "80",
            reqd: 1,
            default: frappe.datetime.get_today(),
        },
        {
            fieldname: "item_group",
            label: __("Item Group"),
            fieldtype: "Link",
            width: "80",
            options: "Item Group",
        },
        {
            fieldname: "item_code",
            label: __("Item"),
            fieldtype: "Link",
            width: "80",
            options: "Item",
            get_query: function () {
                return {
                    query: "erpnext.controllers.queries.item_query",
                };
            },
        },
        {
            fieldname: "warehouse",
            label: __("Warehouse"),
            fieldtype: "Link",
            width: "80",
            options: "Warehouse",
            get_query: () => {
                let warehouse_type = frappe.query_report.get_filter_value("warehouse_type");
                let company = frappe.query_report.get_filter_value("company");

                return {
                    filters: {
                        ...(warehouse_type && { warehouse_type }),
                        ...(company && { company }),
                    },
                };
            },
        },
        {
            fieldname: "warehouse_type",
            label: __("Warehouse Type"),
            fieldtype: "Link",
            width: "80",
            options: "Warehouse Type",
        },
        {
            fieldname: "valuation_field_type",
            label: __("Valuation Field Type"),
            fieldtype: "Select",
            width: "80",
            options: "Currency\nFloat",
            default: "Currency",
        },
        {
            fieldname: "include_uom",
            label: __("Include UOM"),
            fieldtype: "Link",
            options: "UOM",
        },
        {
            fieldname: "show_variant_attributes",
            label: __("Show Variant Attributes"),
            fieldtype: "Check",
        },
        {
            fieldname: "show_stock_ageing_data",
            label: __("Show Stock Ageing Data"),
            fieldtype: "Check",
        },
        {
            fieldname: "ignore_closing_balance",
            label: __("Ignore Closing Balance"),
            fieldtype: "Check",
            default: 0,
        },
        {
            fieldname: "include_zero_stock_items",
            label: __("Include Zero Stock Items"),
            fieldtype: "Check",
            default: 0,
        },
        // إضافة حقل الباركود
        {
            fieldname: "barcode",
            label: __("Barcode"),
            fieldtype: "Data",
            width: "80",
            nchange: function() {
                let barcode_value = frappe.query_report.get_filter_value("barcode");
                console.log("Barcode entered:", barcode_value); // DEBUG

                if (barcode_value) {
                    frappe.db.get_value("Item Barcode", { barcode: barcode_value }, "parent").then(r => {
                        if (r && r.parent) {
                            frappe.query_report.set_filter_value("item_code", r.parent);
                        } else {
                            frappe.msgprint(__("No Item found for this barcode."));
                            frappe.query_report.set_filter_value("item_code", "");
                        }

                        frappe.query_report.refresh();

                        //Refocus the barcode field without clearing
                        setTimeout(() => {

                            let barcode_input = frappe.query_report.page.fields_dict["barcode"].$input;

                            if (barcode_input) {
                                barcode_input.focus();
                            } else {
                                console.error("Barcode input not found for selection.");
                            }

                        }, 750);
                    });
                } else {
                    frappe.query_report.set_filter_value("item_code", "");
                    frappe.query_report.refresh();
                }
            },
        },
    ],

    formatter: function (value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);

        if (column.fieldname == "out_qty" && data && data.out_qty > 0) {
            value = "<span style='color:red'>" + value + "</span>";
        } else if (column.fieldname == "in_qty" && data && data.in_qty > 0) {
            value = "<span style='color:green'>" + value + "</span>";
        }

        return value;
    },

    // إضافة وظيفة rendered
    onload: function(query_report) {
        setTimeout(() => {
            // 1. تسجيل معلومات الحقول في وحدة التحكم
            console.log("Fields Dictionary:", query_report.page.fields_dict);

            // 2. التحقق من وجود الحقل قبل محاولة تفعيله
            if (query_report.page.fields_dict && query_report.page.fields_dict["barcode"]) {
                // 3. محاولة تفعيل الحقل باستخدام jQuery
                try {
                    query_report.page.fields_dict["barcode"].$input.focus();
                } catch (e) {
                    console.error("Error focusing with jQuery:", e);

                    try {
                        const barcodeField = document.querySelector('[data-fieldname="barcode"] input');
                        if (barcodeField) {
                            barcodeField.focus();
                        } else {
                            console.error("Barcode field not found with querySelector!");
                        }
                    } catch (e) {
                        console.error("Error focusing with querySelector:", e);
                    }
                }
            } else {
                console.error("Barcode field not found in fields_dict!");
            }
        }, 1500); // زيادة التأخير إلى 1500 مللي ثانية
    }
};

// تمرير كائن التقرير إلى الدالة add_inventory_dimensions
erpnext.utils.add_inventory_dimensions(frappe.query_reports["Stock Balance With Barcode Scanning Feature"], 8);

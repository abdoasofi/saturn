
// /app/saturn/public/js/pos_override_controller.js

function overridePOSComponents() {
    // نستخدم فحص قوي لضمان وجود الكلاسات المطلوبة
    if (typeof erpnext !== 'undefined' &&
        typeof erpnext.PointOfSale !== 'undefined' &&
        typeof erpnext.PointOfSale.ItemSelector !== 'undefined') {
        
        console.log("Saturn POS Override: ItemSelector class is ready. Applying overrides.");


        // =========================================================
        // 1. تجاوز دالة بناء HTML (لإزالة القص frappe.ellipsis)
        // =========================================================
        erpnext.PointOfSale.ItemSelector.prototype.get_item_html = function(item) {
            const me = this;
            const { item_image, serial_no, batch_no, barcode, actual_qty, uom, price_list_rate } = item;
            const precision = flt(price_list_rate, 2) % 1 != 0 ? 2 : 0;
            let indicator_color;
            let qty_to_display = actual_qty;

            if (item.is_stock_item) {
                indicator_color = actual_qty > 10 ? "green" : actual_qty <= 0 ? "red" : "orange";
                if (Math.round(qty_to_display) > 999) {
                    qty_to_display = Math.round(qty_to_display) / 1000;
                    qty_to_display = qty_to_display.toFixed(1) + "K";
                }
            } else {
                indicator_color = "";
                qty_to_display = "";
            }

            function get_item_image_html() {
                const item_abbr = frappe.get_abbr(item.item_name);
                if (!me.hide_images && item_image) {
                        // **MODIFICATION HERE:** REMOVE inline style height:12rem; min-height:12rem
                        // We will control height via CSS file.
                        return `<div class="item-qty-pill"><span class="indicator-pill whitespace-nowrap ${indicator_color}">${qty_to_display}</span></div>
                                <div class="item-image-container flex items-center justify-center border-b-grey text-6xl text-grey-100"> 
                                    <img onerror="cur_pos.item_selector.handle_broken_image(this)" class="h-full item-img" src="${item_image}" alt="${item_abbr}">
                                </div>`;
                
                } else {
                    return `<div class="item-qty-pill"><span class="indicator-pill whitespace-nowrap ${indicator_color}">${qty_to_display}</span></div>
                            <div class="item-display abbr">${item_abbr}</div>`;
                }
            }
            
            return `<div class="item-wrapper"
                    data-item-code="${escape(item.item_code)}" data-serial-no="${escape(serial_no)}"
                    data-batch-no="${escape(batch_no)}" data-uom="${escape(uom)}"
                    data-rate="${escape(price_list_rate || 0)}"
                    data-stock-uom="${escape(item.stock_uom)}"
                    title="${item.item_name}">
                    ${get_item_image_html()}
                    <div class="item-detail">
                        <div class="item-name">
                            ${item.item_name}
                        </div>
                        <div class="item-rate">${format_currency(price_list_rate, item.currency, precision) || 0} / ${uom}</div>
                    </div>
                </div>`;
        };

        // =========================================================
        // 2. تجاوز دالة تغيير حجم المحدِّد (resize_selector) لفرض 3 أعمدة
        // =========================================================
        erpnext.PointOfSale.ItemSelector.prototype.resize_selector = function(minimize) {
            // ... (كود تغيير حجم الحاوية الخارجية)

            // فرض 3 أعمدة في قائمة الأصناف
            minimize
                ? this.$items_container.css("grid-template-columns", "repeat(1, minmax(0, 1fr))")
                : this.$items_container.css("grid-template-columns", "repeat(3, minmax(0, 1fr))"); 
        };
        
        // إجبار واجهة الأصناف على إعادة التحميل لتطبيق التعديل فوراً
        if (window.cur_pos && window.cur_pos.item_selector) {
            window.cur_pos.item_selector.filter_items(); 
        }

    } else {
        // إذا لم يتم العثور على الكلاس، أعد المحاولة بعد 100 ملي ثانية
        setTimeout(overridePOSComponents, 100);
    }
}

// ابدأ الدالة في التنفيذ
overridePOSComponents();
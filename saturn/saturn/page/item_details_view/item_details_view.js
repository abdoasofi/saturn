// item_details_view.js - V7 (Professional UI/UX & Bilingual)

frappe.pages['item-details-view'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Item Details Viewer"), // Translatable Title
        single_column: true
    });

    // Fetch company info first, then render the page
    frappe.call({
        method: "saturn.saturn.page.item_details_view.item_details_view.get_company_info",
        callback: function(r) {
            render_page_layout(page, r.message);
            setup_page_logic(page);
        }
    });
};

function render_page_layout(page, company_info) {
    const page_html = `
        <style>
            .item-viewer-wrapper { direction: ${frappe.boot.lang === 'ar' ? 'rtl' : 'ltr'}; padding: 15px; }
            .page-header-section {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 15px; background-color: var(--control-bg); border-radius: var(--border-radius);
                margin-bottom: 20px; border: 1px solid var(--border-color);
            }
            .company-logo img { max-height: 40px; }
            .date-time-section { text-align: center; font-size: 1.1rem; font-weight: 500; color: var(--text-color); }
            .search-card {
                padding: 2rem; background-color: #fff; border-radius: var(--border-radius);
                border: 1px solid var(--border-color); box-shadow: var(--shadow-xs);
                margin-bottom: 25px; text-align: center;
            }
            #scanned-value-input { text-align: center; font-weight: bold; font-size: 1.5rem; max-width: 500px; margin: auto; }
            .item-details-grid {
                display: grid; grid-template-columns: 2fr 1fr; gap: 25px;
                animation: fadeIn 0.5s ease-in-out;
            }
            .item-main-details, .item-side-details {
                background-color: #fff; border-radius: var(--border-radius);
                border: 1px solid var(--border-color); padding: 20px; box-shadow: var(--shadow-xs);
            }
            .item-main-details h2 { font-weight: 600; margin-bottom: 25px; }
            .item-image-wrapper { text-align: center; }
            .item-image-wrapper img { max-width: 100%; max-height: 200px; border-radius: var(--border-radius); }
            .missing-image-placeholder { background-color: #f8f9fa; padding: 40px; border: 1px dashed #d1d8dd; border-radius: var(--border-radius); }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            @media (max-width: 768px) { .item-details-grid { grid-template-columns: 1fr; } }
        </style>

        <div class="item-viewer-wrapper">
            <div class="page-header-section">
                <div class="company-logo">
                    ${company_info.logo_url ? `<img src="${company_info.logo_url}" alt="${company_info.company_name}">` : `<span>${company_info.company_name || ''}</span>`}
                </div>
                <div class="date-time-section">
                    <div id="current-date"></div>
                    <div id="current-time"></div>
                </div>
                <div class="language-selector">
                    <!-- Language switcher can be added here if needed -->
                </div>
            </div>

            <div class="search-card">
                <h4><i class="fa fa-barcode"></i> ${__("Scan Item Barcode")}</h4>
                <p class="text-muted">${__("Search starts automatically after scanning or typing.")}</p>
                <input type="text" id="scanned-value-input" class="form-control" placeholder="${__("Waiting for barcode...")}" autocomplete="off">
            </div>

            <div id="loading-indicator" class="text-center" style="display: none; margin: 20px;"><div class="spinner-border text-primary" role="status"></div></div>
            <div id="error-message" class="alert alert-danger" style="display: none; text-align: center;"></div>

            <div id="item-details-section" style="display: none;">
                <!-- New Two-Column Layout -->
                <div class="item-details-grid">
                    <div class="item-main-details">
                        <h2 id="item-name-title"></h2>
                        <dl class="row">
                            <dt class="col-sm-4">${__("Item Code")}</dt><dd class="col-sm-8" id="item-code"></dd>
                            <dt class="col-sm-4">${__("Saturn Code")}</dt><dd class="col-sm-8" id="item-saturn-code"></dd>
							<dt class="col-sm-4">${__("SKU")}</dt><dd class="col-sm-8" id="item-sku"></dd>
							<dt class="col-sm-4">${__("Item Group")}</dt><dd class="col-sm-8" id="item-group"></dd>
                            <dt class="col-sm-4">${__("Standard Selling Price")}</dt><dd class="col-sm-8"><strong><span id="item-price"></span></strong></dd>
                            <dt class="col-sm-4">${__("Description")}</dt><dd class="col-sm-8" id="item-description"></dd>
                        </dl>
                    </div>
                    <div class="item-side-details">
                        <div class="item-image-wrapper mb-3" id="item-image"></div>
                        <h5><i class="fa fa-cubes"></i> ${__("Stock Levels")}</h5>
                        <div class="table-responsive"><table class="table table-hover"><tbody id="stock-levels-table-body"></tbody></table></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    $(page.main).html(page_html);
}

function setup_page_logic(page) {
    const $main = $(page.main);
    const $input = $main.find('#scanned-value-input');
    
    // Auto Focus
    setTimeout(() => { $input.focus(); }, 200);

    // Live Clock
    update_time();
    setInterval(update_time, 1000);

    // Debounced Search
    let debounce_timer;
    $input.on('input', function() {
        clearTimeout(debounce_timer);
        const scannedValue = $(this).val().trim();
        if (scannedValue) {
            debounce_timer = setTimeout(() => {
                fetchItemData(scannedValue, page);
            }, 300);
        } else {
            $main.find('#item-details-section').hide();
            $main.find('#error-message').hide();
        }
    });
}

function update_time() {
    const now = new Date();
    const lang = frappe.boot.lang;
    const date_options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const time_options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    
    $('#current-date').text(now.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', date_options));
    $('#current-time').text(now.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', time_options));
}

function fetchItemData(scannedValue, page) { /* No changes here */ }
function populateItemDetails(details, page) { /* No changes here */ }
function populateStockLevels(stockLevels, page) { /* No changes here, just copy from previous version */ }

// --- PASTE THE UNCHANGED FUNCTIONS FROM THE PREVIOUS VERSION HERE ---
function fetchItemData(scannedValue, page) {
    const $main = $(page.main);
    const $detailsSection = $main.find('#item-details-section');
    const $loading = $main.find('#loading-indicator');
    const $error = $main.find('#error-message');
    
    $loading.show();
    $detailsSection.hide();
    $error.hide();

    frappe.call({
        method: 'saturn.saturn.page.item_details_view.item_details_view.get_item_details_and_stock',
        args: { scanned_value: scannedValue },
        callback: function(r) {
            if (r.message) {
                populateItemDetails(r.message.details, page);
                populateStockLevels(r.message.stock_levels, page);
                $detailsSection.show();
            }
        },
        error: function(r) {
            $detailsSection.hide();
            $error.html(r.message || __("An unexpected error occurred.")).show();
        },
        always: function() { $loading.hide(); }
    });
}
function populateItemDetails(details, page) {
    const $main = $(page.main);
    $main.find('#item-name-title').text(details.item_name);
    $main.find('#item-code').text(details.item_code);
	$main.find('#item-saturn-code').text(details.saturn_code || `${__("Not available")}`);
	$main.find('#item-sku').text(details.sku || `${__("Not available")}`);
    $main.find('#item-description').html(details.description || `${__("Not available")}`);
    $main.find('#item-group').text(details.item_group);
    $main.find('#item-price').text(format_currency(details.standard_selling_rate, frappe.defaults.get_default("currency")));
    if (details.image) {
        $main.find('#item-image').html(`<img src="${details.image}" class="img-fluid" alt="${details.item_name}">`);
    } else {
        $main.find('#item-image').html(`<div class="missing-image-placeholder"><i class="fa fa-camera fa-3x text-muted"></i></div>`);
    }
}
function populateStockLevels(stockLevels, page) {
    const $stockTableBody = $(page.main).find('#stock-levels-table-body');
    $stockTableBody.empty();
    if (stockLevels.length === 0) {
        $stockTableBody.append(`<tr><td class="text-center text-muted p-3">${__("This item is not available in any warehouse.")}</td></tr>`);
    } else {
        stockLevels.forEach(stock => {
            $stockTableBody.append(`<tr><td>${stock.warehouse}</td><td class="text-right"><strong>${stock.actual_qty}</strong></td></tr>`);
        });
    }
}
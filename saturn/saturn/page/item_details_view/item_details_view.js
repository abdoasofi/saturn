// item_details_view.js - V6 (Instant Search + Auto Focus)

frappe.pages['item-details-view'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'عرض تفاصيل الصنف',
        single_column: true
    });

    const page_html = `
        <style>
            .item-details-view-container { direction: rtl; }
            .page-card { background-color: #fff; border: 1px solid #d1d8dd; border-radius: 4px; padding: 15px; margin-bottom: 15px; }
            #scanned-value-input { text-align: center; font-weight: bold; font-size: 1.2rem; }
        </style>

        <div class="item-details-view-container">
            <div class="page-card">
                <h4><i class="fa fa-barcode"></i> مسح باركود الصنف</h4>
                <p class="text-muted">يبدأ البحث تلقائياً بمجرد إدخال الباركود.</p>
                <div class="form-group">
                    <input type="text" id="scanned-value-input" class="form-control input-lg" placeholder="...في انتظار الباركود" autocomplete="off">
                </div>
            </div>
            <div id="loading-indicator" class="text-center" style="display: none; margin: 20px;"><div class="spinner-border text-primary" role="status"></div><p>...جاري البحث</p></div>
            <div id="error-message" class="alert alert-danger" style="display: none; text-align: center;"></div>
            <div id="item-details-section" style="display: none;">
                <!-- HTML for details and stock table remains the same -->
                 <div class="page-card">
                    <h2 id="item-name-title" class="mb-4"></h2>
                    <div class="row">
                        <div class="col-md-3 text-center"><div id="item-image"></div></div>
                        <div class="col-md-9"><dl class="row"><dt class="col-sm-4">كود الصنف</dt><dd class="col-sm-8" id="item-code"></dd><dt class="col-sm-4">مجموعة الصنف</dt><dd class="col-sm-8" id="item-group"></dd><dt class="col-sm-4">سعر البيع</dt><dd class="col-sm-8"><strong><span id="item-price"></span></strong></dd><dt class="col-sm-4">الوصف</dt><dd class="col-sm-8" id="item-description"></dd></dl></div>
                    </div>
                </div>
                <div class="page-card">
                    <h4><i class="fa fa-cubes"></i> الكميات في المخازن</h4>
                    <div class="table-responsive"><table class="table table-bordered table-hover"><thead class="thead-light"><tr><th>المخزن</th><th>الكمية الفعلية</th></tr></thead><tbody id="stock-levels-table-body"></tbody></table></div>
                </div>
            </div>
        </div>
    `;

    $(page.main).html(page_html);
    setup_page_logic(page);
};

// **This is where the magic happens!**
function setup_page_logic(page) {
    const $main = $(page.main);
    const $input = $main.find('#scanned-value-input');
    
    // 1. **Auto Focus**: Focus on the input field as soon as the page loads.
    // We add a small delay to ensure the element is fully rendered.
    setTimeout(() => {
        $input.focus();
    }, 100);

    let debounce_timer;

    // 2. **Instant Search**: Use the 'input' event instead of 'change'.
    $input.on('input', function() {
        // Clear the previous timer
        clearTimeout(debounce_timer);
        
        const scannedValue = $(this).val().trim();

        if (scannedValue) {
            // Set a new timer. The fetch function will only run after 300ms of inactivity.
            // This is perfect for barcode scanners (which are very fast) and prevents spamming the server with manual typing.
            debounce_timer = setTimeout(() => {
                fetchItemData(scannedValue, page);
            }, 300); // 300 milliseconds delay
        } else {
            // If the input is cleared, hide the details section
            $main.find('#item-details-section').hide();
            $main.find('#error-message').hide();
        }
    });
}


// No changes are needed in the functions below this line
// =======================================================

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
        args: {
            scanned_value: scannedValue
        },
        callback: function(r) {
            if (r.message) {
                populateItemDetails(r.message.details, page);
                populateStockLevels(r.message.stock_levels, page);
                $detailsSection.show();
            }
        },
        error: function(r) {
            $detailsSection.hide(); // Hide old results if there's an error
            $error.html(r.message || "حدث خطأ غير متوقع.").show();
        },
        always: function() {
            $loading.hide();
        }
    });
}

function populateItemDetails(details, page) { /* ... no change ... */ const $main = $(page.main); $main.find('#item-name-title').text(details.item_name); $main.find('#item-code').text(details.item_code); $main.find('#item-description').html(details.description || '<span class="text-muted">لا يوجد وصف</span>'); $main.find('#item-group').text(details.item_group); $main.find('#item-price').text(format_currency(details.standard_selling_rate, frappe.defaults.get_default("currency"))); if (details.image) { $main.find('#item-image').html(`<img src="${details.image}" class="img-fluid" alt="${details.item_name}">`); } else { $main.find('#item-image').html('<div class="missing-image"><i class="fa fa-camera fa-5x text-muted"></i></div>'); } }
function populateStockLevels(stockLevels, page) { /* ... no change ... */ const $stockTableBody = $(page.main).find('#stock-levels-table-body'); $stockTableBody.empty(); if (stockLevels.length === 0) { $stockTableBody.append(`<tr><td colspan="2" class="text-center text-muted p-4">هذا الصنف غير متوفر في أي مخزن حاليًا.</td></tr>`); } else { stockLevels.forEach(stock => { $stockTableBody.append(`<tr><td>${stock.warehouse}</td><td><span class="badge badge-lg" style="background-color: #17a2b8; color: white; font-size: 1.1em;">${stock.actual_qty}</span></td></tr>`); }); } }
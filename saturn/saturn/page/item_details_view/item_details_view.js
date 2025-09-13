// item_details_view.js - V16 (The Ultimate UX Version)

// --- HELPER FUNCTIONS ---
function loadScripts(urls) { return Promise.all(urls.map(loadScript)); }
function loadScript(url) { return new Promise((resolve, reject) => { if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; } const script = document.createElement('script'); script.src = url; script.onload = () => resolve(); script.onerror = () => reject(new Error(`Failed to load script: ${url}`)); document.head.appendChild(script); }); }
function playScanSuccessSound() { try { const audio = new Audio('https://frappe.io/files/success.mp3'); audio.play(); } catch(e) { console.log("Could not play sound."); } }

// --- ON PAGE LOAD ---
frappe.pages['item-details-view'].on_page_load = function(wrapper) {
    const QRCODE_GEN_URL = 'https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js';
    const QRCODE_SCAN_URL = 'https://unpkg.com/html5-qrcode';

    let page = frappe.ui.make_app_page({ parent: wrapper, title: __("Item Details Viewer"), single_column: true });
    $(page.main).html(`<div class="text-center p-5"><h4>${__("Initializing Viewer...")}</h4></div>`);

    loadScripts([QRCODE_GEN_URL, QRCODE_SCAN_URL])
        .then(() => {
            frappe.call({ 
                method: "saturn.saturn.page.item_details_view.item_details_view.get_company_info", 
                callback: function(r) { 
                    render_page_layout(page, r.message); 
                    setup_page_logic(page); 
                } 
            });
        }).catch(error => { 
            console.error(error); 
            frappe.msgprint({ title: __('Error'), indicator: 'red', message: __('Failed to load required libraries. Please check your internet connection.') }); 
        });
};

// --- RENDER PAGE LAYOUT ---
function render_page_layout(page, company_info) {
    const is_rtl = frappe.boot.lang === 'ar';
    const page_html = `
        <style>
            .item-viewer-wrapper { padding: 15px; background-color: #f8f9fa; min-height: 100vh;}
            .page-header-section { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background-color: #fff; border-radius: var(--border-radius); margin-bottom: 20px; border: 1px solid var(--border-color); }
            .company-logo img { max-height: 35px; }
            .date-time-section { text-align: center; font-size: 1rem; color: var(--text-color); }
            .search-card { padding: 1.5rem; background-color: #fff; border-radius: var(--border-radius); border: 1px solid var(--border-color); margin-bottom: 25px; text-align: center; transition: all 0.3s ease; }
            #scanned-value-input { text-align: center; font-weight: bold; font-size: 1.5rem; max-width: 450px; margin: auto; }
            .item-details-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 25px; animation: fadeIn 0.5s ease-in-out; align-items: start; }
            .page-card { background-color: #fff; border-radius: var(--border-radius); border: 1px solid var(--border-color); padding: 25px; }
            .item-main-details h2 { font-weight: 600; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #eee; }
            .item-main-details dl dt { font-weight: 600; color: #6c757d; }
            .item-main-details dl dd { margin-bottom: 0.75rem; color: #212529; }
            .item-image-wrapper img { max-width: 100%; max-height: 250px; border-radius: var(--border-radius); border: 1px solid #eee; padding: 5px; }
            .qr-code-section { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; text-align: center; }
            #item-qrcode-container { padding: 5px; background-color: #fff; border: 1px solid #eee; display: inline-block; border-radius: 4px; margin-bottom: 10px;}
            .stock-levels-card { margin-top: 25px; }
            .stock-levels-card h5 { margin-bottom: 15px; }
            .camera-scan-section { margin-top: 15px; }
            #qr-camera-reader { width: 100%; max-width: 500px; margin: 15px auto 0; border: 2px dashed #ccc; border-radius: var(--border-radius); display: none; overflow: hidden; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            @media (max-width: 992px) { .item-details-grid { grid-template-columns: 1fr; } }
        </style>
        <div class="item-viewer-wrapper" dir="${is_rtl ? 'rtl' : 'ltr'}">
            <div class="page-header-section">
                <div class="company-logo"> ${company_info.logo_url ? `<img src="${company_info.logo_url}" alt="${company_info.company_name}">` : `<span>${company_info.company_name || ''}</span>`} </div>
                <div class="date-time-section"> <div id="current-date"></div> <div id="current-time"></div> </div>
                <div class="header-actions" style="width: 50px;"></div>
            </div>
            <div class="search-card">
                <div id="manual-input-container">
                    <h4><i class="fa fa-keyboard-o"></i> ${__("Manual Entry or Hardware Scan")}</h4>
                    <input type="text" id="scanned-value-input" class="form-control" placeholder="${__("Waiting for barcode...")}" autocomplete="off">
                </div>
                <div class="camera-scan-section">
                    <button id="start-camera-scan-btn" class="btn btn-primary"><i class="fa fa-camera"></i> ${__("Scan with Camera")}</button>
                    <div id="qr-camera-reader"></div>
                </div>
            </div>
            <div id="loading-indicator" class="text-center" style="display: none; margin: 20px;"><div class="spinner-border text-primary"></div></div>
            <div id="error-message" class="alert alert-danger" style="display: none; text-align: center;"></div>
            <div id="item-details-section" style="display: none;">
                <div class="item-details-grid">
                    <div class="main-column">
                        <div class="item-main-details page-card"> <h2 id="item-name-title"></h2> <dl class="row"> <dt class="col-sm-4">${__("Item Code")}</dt><dd class="col-sm-8" id="item-code"></dd> <dt class="col-sm-4">${__("Saturn Code")}</dt><dd class="col-sm-8" id="item-saturn-code"></dd> <dt class="col-sm-4">${__("SKU")}</dt><dd class="col-sm-8" id="item-sku"></dd> <dt class="col-sm-4">${__("Item Group")}</dt><dd class="col-sm-8" id="item-group"></dd> <dt class="col-sm-4">${__("EN-DETAIL SHOWROOM")}</dt><dd class="col-sm-8"><strong><span id="item-price_1"></span></strong></dd> <dt class="col-sm-4">${__("EN-GROSS")}</dt><dd class="col-sm-8"><strong><span id="item-price_2"></span></strong></dd> <dt class="col-sm-4">${__("Description")}</dt><dd class="col-sm-8" id="item-description"></dd> </dl> </div>
                        <div class="stock-levels-card page-card"> <h5><i class="fa fa-cubes"></i> ${__("Stock Levels")}</h5> <div class="table-responsive"><table class="table table-hover"><tbody id="stock-levels-table-body"></tbody></table></div> </div>
                    </div>
                    <div class="item-side-details page-card"> <div class="item-image-wrapper" id="item-image"></div> <div class="qr-code-section"> <div id="item-qrcode-container"></div> <button id="download-qr-btn" class="btn btn-sm btn-secondary"><i class="fa fa-download"></i> ${__("Download QR")}</button> </div> </div>
                </div>
            </div>
        </div>
    `;
    $(page.main).html(page_html);
}

function setup_page_logic(page) {
    const $main = $(page.main);
    const $input = $main.find('#scanned-value-input');
    const $manualInputContainer = $main.find('#manual-input-container');

    setTimeout(() => { $input.focus(); }, 200);
    update_time(); setInterval(update_time, 1000);

    let debounce_timer;
    $input.on('input', function() { clearTimeout(debounce_timer); const scannedValue = $(this).val().trim(); if (scannedValue) { debounce_timer = setTimeout(() => { fetchItemData(scannedValue, page); }, 300); } else { $main.find('#item-details-section').hide(); $main.find('#error-message').hide(); } });
    
    let html5QrCode = null;
    $('#start-camera-scan-btn').on('click', function() {
        const reader = $('#qr-camera-reader');
        const button = $(this);
        if (reader.is(":visible")) {
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().then(() => {
                    reader.hide(); button.html(`<i class="fa fa-camera"></i> ${__("Scan with Camera")}`).removeClass('btn-danger').addClass('btn-primary');
                    $manualInputContainer.show();
                }).catch(err => console.error("Failed to stop camera.", err));
            }
        } else {
            reader.show(); button.html(`<i class="fa fa-times"></i> ${__("Stop Camera")}`).removeClass('btn-primary').addClass('btn-danger');
            $manualInputContainer.hide();
            html5QrCode = new Html5Qrcode("qr-camera-reader", true); // Verbose mode for debugging
            const qrCodeSuccessCallback = (decodedText, decodedResult) => {
                if (html5QrCode.isScanning) { html5QrCode.stop(); }
                reader.hide(); button.html(`<i class="fa fa-camera"></i> ${__("Scan with Camera")}`).removeClass('btn-danger').addClass('btn-primary');
                $manualInputContainer.show();
                playScanSuccessSound();
                $input.val(decodedText).focus(); fetchItemData(decodedText, page);
            };
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
                .catch(err => {
                    frappe.msgprint({ title: __("Camera Error"), message: __("Could not start camera. Please grant permission and ensure you are on a secure (https) connection."), indicator: 'red' });
                    button.html(`<i class="fa fa-camera"></i> ${__("Scan with Camera")}`).removeClass('btn-danger').addClass('btn-primary'); reader.hide();
                    $manualInputContainer.show();
                });
        }
    });
}

function fetchItemData(scannedValue, page) { const $main = $(page.main); const $input = $main.find('#scanned-value-input'); const $detailsSection = $main.find('#item-details-section'); const $loading = $main.find('#loading-indicator'); const $error = $main.find('#error-message'); $loading.show(); $detailsSection.hide(); $error.hide(); frappe.call({ method: 'saturn.saturn.page.item_details_view.item_details_view.get_item_details_and_stock', args: { scanned_value: scannedValue }, callback: function(r) { if (r.message) { populateItemDetails(r.message.details, page); populateStockLevels(r.message.stock_levels, page); $detailsSection.show(); } else { const error_msg = frappe.format(__("Item with barcode '{0}' not found or is incorrect."), [scannedValue]); $error.html(`<h5><i class="fa fa-exclamation-triangle"></i> ${__("Item Not Found")}</h5><p>${error_msg}</p>`).show(); $input.val(''); } }, error: function(r) { $error.html(`<h5>${__("Server Error")}</h5><p>${__("An unexpected error occurred.")}</p>`).show(); $detailsSection.hide(); }, always: function() { $loading.hide(); $input.focus(); } }); }
function populateItemDetails(details, page) { const $main = $(page.main); $main.find('#item-name-title').text(details.item_name); $main.find('#item-code').text(details.item_code); $main.find('#item-saturn-code').text(details.saturn_code || `-`); $main.find('#item-sku').text(details.sku || `-`); $main.find('#item-description').html(details.description || `<span class="text-muted">${__("Not available")}</span>`); $main.find('#item-group').text(details.item_group); const formatted_price_1 = format_currency(details.EN_DETAIL_SHOWROOM, frappe.defaults.get_default("currency"), 2); $main.find('#item-price_1').text(formatted_price_1); const formatted_price_2 = format_currency(details.EN_GROSS, frappe.defaults.get_default("currency"), 2); $main.find('#item-price_2').text(formatted_price_2); if (details.image) { $main.find('#item-image').html(`<img src="${details.image}" class="img-fluid" alt="${details.item_name}">`); } else { $main.find('#item-image').html(`<div class="missing-image-placeholder"><i class="fa fa-camera fa-3x text-muted"></i></div>`); } generateQRCode(details.item_code, details.item_name); }
function generateQRCode(item_code, item_name) { const container = document.getElementById('item-qrcode-container'); container.innerHTML = ''; new QRCode(container, { text: item_code, width: 128, height: 128, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H }); $('#download-qr-btn').off('click').on('click', function() { const qrCanvas = container.querySelector('canvas'); if (qrCanvas) { const link = document.createElement('a'); link.download = `QR-${item_name.replace(/[\s/\\?%*:|"<>]/g, '_')}.png`; link.href = qrCanvas.toDataURL('image/png'); link.click(); } }); }
function update_time() { const now = new Date(); const lang = frappe.boot.lang; const date_options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }; const time_options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }; $('#current-date').text(now.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', date_options)); $('#current-time').text(now.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', time_options)); }
function populateStockLevels(stockLevels, page) {
    const $stockTableBody = $(page.main).find('#stock-levels-table-body');
    $stockTableBody.empty();

    // Helper: تحويل النص/قيمة لرقم صالح مع تجاهل الفواصل
    const toNumber = (v) => {
        if (v === null || v === undefined) return 0;
        const s = String(v).replace(/,/g, '').trim();
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    };

    if (!Array.isArray(stockLevels) || stockLevels.length === 0) {
        $stockTableBody.append(`<tr><td colspan="2" class="text-center text-muted p-3">${__("This item is not available in any warehouse.")}</td></tr>`);
        return;
    }

    // ادرج الصفوف وحسب المجموع
    let total = 0;
    stockLevels.forEach(stock => {
        const qty = toNumber(stock.actual_qty);
        total += qty;

        // عرض رقم الكمية كما هو (أو استخدم format_currency لو تحب صِيغة العملة)
        const qty_display = format_currency(qty, frappe.defaults.get_default("currency"), 2);
        $stockTableBody.append(`<tr><td>${stock.warehouse}</td><td class="text-right"><strong>${qty_display}</strong></td></tr>`);
    });

    // صف المجموع النهائي
    const total_display = format_currency(total, frappe.defaults.get_default("currency"), 2);
    $stockTableBody.append(`
        <tr class="table-active">
            <td><strong>${__("Total")}</strong></td>
            <td class="text-right"><strong>${total_display}</strong></td>
        </tr>
    `);
}

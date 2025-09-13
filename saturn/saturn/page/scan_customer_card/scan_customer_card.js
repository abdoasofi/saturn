// scan_customer_card.js (with Open in New Tab fix)

// --- HELPER FUNCTIONS (No change) ---
function loadScript(url) { return new Promise((resolve, reject) => { if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; } const script = document.createElement('script'); script.src = url; script.onload = () => resolve(); script.onerror = () => reject(new Error(`Failed to load script: ${url}`)); document.head.appendChild(script); }); }
function playScanSuccessSound() { try { const audio = new Audio('https://frappe.io/files/success.mp3'); audio.play(); } catch(e) {} }
function playScanErrorSound() { try { const audio = new Audio('https://frappe.io/files/error.mp3'); audio.play(); } catch(e) {} }

// --- PAGE INITIALIZATION (No change) ---
frappe.pages['scan-customer-card'].on_page_load = function(wrapper) {
    const QRCODE_SCAN_URL = 'https://unpkg.com/html5-qrcode';
    let page = frappe.ui.make_app_page({ parent: wrapper, title: __("Scan Customer Card"), single_column: true });
    loadScript(QRCODE_SCAN_URL)
        .then(() => {
            render_page_layout(page);
            setup_page_logic(page);
        }).catch(error => {
            $(page.main).html(`<div class="alert alert-danger">${__("Failed to load scanner components.")}</div>`);
        });
};

// --- UI RENDERING (No change) ---
function render_page_layout(page) {
    const is_rtl = frappe.boot.lang === 'ar';
    const page_html = `
        <style>
            .scan-container { max-width: 600px; margin: 2rem auto; }
            .scan-card { padding: 1.5rem; background-color: #fff; border-radius: var(--border-radius); text-align: center; border: 1px solid var(--border-color); }
            #card-number-input { text-align: center; font-weight: bold; font-size: 1.5rem; margin-bottom: 1rem; }
            .camera-scan-section { margin-top: 15px; }
            #qr-camera-reader { width: 100%; border: 2px dashed #ccc; border-radius: var(--border-radius); display: none; overflow: hidden; margin-top: 15px; }
            .scan-status { font-weight: bold; font-size: 1.1rem; margin-top: 1rem; min-height: 2rem; }
        </style>
        <div class="scan-container" dir="${is_rtl ? 'rtl' : 'ltr'}">
            <div class="scan-card">
                <div id="manual-input-container">
                    <h4><i class="fa fa-keyboard-o"></i> ${__("Manual Entry or Hardware Scan")}</h4>
                    <input type="text" id="card-number-input" class="form-control" placeholder="${__("Waiting for card number...")}" autocomplete="off">
                </div>
                <div class="camera-scan-section">
                    <button id="start-camera-scan-btn" class="btn btn-primary"><i class="fa fa-camera"></i> ${__("Scan with Camera")}</button>
                    <div id="qr-camera-reader"></div>
                </div>
                <div id="scan-status" class="scan-status"></div>
            </div>
        </div>
    `;
    $(page.main).html(page_html);
}

// --- LOGIC AND EVENT HANDLING (No change) ---
function setup_page_logic(page) {
    const $main = $(page.main);
    const $input = $main.find('#card-number-input');
    const $manualInputContainer = $main.find('#manual-input-container');
    const statusDiv = $main.find('#scan-status');
    setTimeout(() => { $input.focus(); }, 200);

    let debounce_timer;
    $input.on('input', function() {
        clearTimeout(debounce_timer);
        const cardNumber = $(this).val().trim();
        if (cardNumber) {
            debounce_timer = setTimeout(() => {
                findCustomerAndOpenSO(cardNumber);
            }, 300);
        }
    });

    let html5QrCode = null;
    $main.find('#start-camera-scan-btn').on('click', function() {
        const reader = $main.find('#qr-camera-reader');
        const button = $(this);
        if (reader.is(":visible")) {
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().then(() => {
                    reader.hide(); button.html(`<i class="fa fa-camera"></i> ${__("Scan with Camera")}`).removeClass('btn-danger').addClass('btn-primary');
                    $manualInputContainer.show(); statusDiv.empty();
                }).catch(err => console.error("Failed to stop camera.", err));
            }
        } else {
            reader.show(); button.html(`<i class="fa fa-times"></i> ${__("Stop Camera")}`).removeClass('btn-primary').addClass('btn-danger');
            $manualInputContainer.hide(); statusDiv.html(`<span class="text-muted">${__("Looking for a QR code...")}</span>`);
            html5QrCode = new Html5Qrcode("qr-camera-reader");
            const qrCodeSuccessCallback = (decodedText, decodedResult) => {
                if (html5QrCode.isScanning) { html5QrCode.stop(); }
                playScanSuccessSound();
                findCustomerAndOpenSO(decodedText);
            };
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
                .catch(err => {
                    statusDiv.html(`<span class="text-danger">${__("Camera Error. Please grant permission and use HTTPS.")}</span>`);
                    reader.hide(); button.html(`<i class="fa fa-camera"></i> ${__("Scan with Camera")}`).removeClass('btn-danger').addClass('btn-primary');
                    $manualInputContainer.show();
                });
        }
    });
}

// --- Central function for finding customer (UPDATED) ---
function findCustomerAndOpenSO(cardNumber) {
    const statusDiv = $('#scan-status');
    statusDiv.html(`<span class="text-info">${__("Searching for customer...")}</span>`);

    frappe.call({
        method: "saturn.saturn.page.scan_customer_card.scan_customer_card.get_customer_by_card_number",
        args: { card_number: cardNumber },
        callback: function(r) {
            if (r.message) {
                const customer_name = r.message;
                statusDiv.html(`<span class="text-success">${__("Customer Found! Opening Sales Order for {0}", [customer_name])}</span>`);

                // **THE FIX: Use window.open with a constructed URL**
                const new_so_url = `/app/sales-order/new?customer=${encodeURIComponent(customer_name)}`;
                window.open(new_so_url, '_blank'); // '_blank' is the key to open in a new tab

                // Reset the page after a short delay for the next scan
                setTimeout(() => {
                    const $input = $('#card-number-input');
                    if ($input.length > 0) {
                        $input.val('').focus();
                        statusDiv.empty();
                        // Stop camera if it was active
                        const cameraButton = $('#start-camera-scan-btn');
                        if (cameraButton.hasClass('btn-danger')) {
                            cameraButton.click();
                        }
                    }
                }, 1500); // Reduced delay

            } else {
                playScanErrorSound();
                statusDiv.html(`<span class="text-danger">${__("No customer found for this card number.")}</span>`);
            }
        }
    });
}
import io
import qrcode
import qrcode.constants
import frappe

@frappe.whitelist(allow_guest=True)
def qr_image(card: str = None, size: int = 300):
    """
    Generate PNG QR on-the-fly from query param `card`.
    Call: /api/method/saturn.saturn.api.qr_image?card=...&size=300

    - allow_guest=True : recommended so wkhtmltopdf (server-side) can fetch without session cookies.
    - size : requested pixel size (square). We will compute best box_size accordingly.
    """
    if not card:
        frappe.throw("Missing 'card' parameter", exc=frappe.ValidationError)

    # QR config similar to many JS libraries:
    error_correction = qrcode.constants.ERROR_CORRECT_Q  # high error correction
    border = 2  # quiet zone
    # compute box_size to approach desired pixel size
    # create a temporary QR to get module count
    qr_tmp = qrcode.QRCode(error_correction=error_correction, border=border)
    qr_tmp.add_data(card)
    qr_tmp.make(fit=True)
    modules_count = qr_tmp.modules_count  # number of modules (boxes) per side

    # choose integer box_size that gives approx requested size
    box_size = max(1, int(size / (modules_count + 2*border)))

    qr = qrcode.QRCode(
        error_correction=error_correction,
        box_size=box_size,
        border=border
    )
    qr.add_data(card)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    # return binary response
    frappe.local.response.filename = f"qr-{frappe.utils.random_string(8)}.png"
    frappe.local.response.filecontent = buf.getvalue()
    frappe.local.response.type = "binary"
    return
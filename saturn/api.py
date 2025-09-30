import io
import qrcode
import qrcode.constants
import frappe
import json
from frappe.utils import flt, nowdate, nowtime
from frappe import _


# your_app/api.py
import frappe
from frappe.utils import flt, nowdate, nowtime
from frappe import _

def create_se_from_material_request(doc, method=None):
    """
    Create and SUBMIT (approved) Stock Entry on submit of Material Request,
    using custom_delivered_q from Material Request Item rows.

    Behavior:
      - Skip if MR not submitted (doc.docstatus != 1)
      - Skip if there is already a Stock Entry referencing this MR (draft/submitted)
      - Build Stock Entry Detail rows from custom_delivered_q
      - Find an appropriate Stock Entry Type by purpose or take first available
      - Insert SE with ignore_permissions and then submit it while setting
        frappe.flags.ignore_permissions = True (to ensure auto-submit)
      - Optionally set `custom_se_created` boolean on MR if that column exists
    """

    # 0. Only run for submitted MR
    if getattr(doc, "docstatus", 0) != 1:
        frappe.log(_("Skipping SE creation: Material Request {0} is not submitted").format(doc.name))
        return

    # 1. Prevent duplicates (any existing SE draft/submitted)
    existing = frappe.get_all(
        "Stock Entry",
        filters={"material_request": doc.name, "docstatus": ["in", [0, 1]]},
        limit=1,
    )
    if existing:
        frappe.log(_("Skipping SE creation: existing Stock Entry found for MR {0}").format(doc.name))
        return

    # 2. Collect items from custom_delivered_q
    items_to_add = []
    for row in getattr(doc, "items", []) or []:
        delivered = flt(getattr(row, "custom_delivered_q", 0) or 0)
        if delivered <= 0:
            continue

        # Determine source/target warehouses
        # Parent MR: from_warehouse (Set Source Warehouse)
        s_wh = getattr(doc, "from_warehouse", None) or getattr(row, "from_warehouse", None)

        # Item row: `warehouse` is target in your MR Item doctype (as you showed)
        t_wh = getattr(row, "warehouse", None) or getattr(row, "t_warehouse", None) or getattr(doc, "set_warehouse", None)

        # UOM / stock_uom
        item_uom = getattr(row, "uom", None)
        if not item_uom and getattr(row, "item_code", None):
            try:
                item_uom = frappe.get_cached_value("Item", row.item_code, "stock_uom")
            except Exception:
                item_uom = None
        stock_uom = getattr(row, "stock_uom", None) or item_uom

        # Basic validation for required warehouses depending on purpose will be later
        se_row = {
            "item_code": row.item_code,
            "qty": delivered,
            "uom": item_uom,
            "stock_uom": stock_uom,
            "conversion_factor": getattr(row, "conversion_factor", 1.0),
            "s_warehouse": s_wh,
            "t_warehouse": t_wh,
            "material_request": doc.name,
            "material_request_item": getattr(row, "name", None),
            "original_item": row.item_code,
        }
        items_to_add.append(se_row)

    if not items_to_add:
        frappe.log(_("No items with custom_delivered_q > 0 for MR {0}").format(doc.name))
        return

    # 3. Decide SE purpose based on material_request_type (fallback to Material Transfer)
    mrt = (getattr(doc, "material_request_type", "") or "").strip()
    purpose_map = {
        "Material Transfer": "Material Transfer",
        "Material Issue": "Material Issue",
        "Purchase": "Material Receipt",
        "Customer Provided": "Material Receipt",
        "Manufacture": "Material Transfer for Manufacture",
    }
    se_purpose = purpose_map.get(mrt, "Material Transfer")

    # 4. Find Stock Entry Type (required field)
    set_type = None
    try:
        types = frappe.get_all("Stock Entry Type", filters={"purpose": se_purpose}, fields=["name"], limit=1)
        if types:
            set_type = types[0].get("name")
        else:
            # fallback to any existing Stock Entry Type
            all_types = frappe.get_all("Stock Entry Type", fields=["name"], limit=1)
            if all_types:
                set_type = all_types[0].get("name")
    except Exception:
        set_type = None

    if not set_type:
        # helpful error so admin knows to create Stock Entry Type records
        frappe.throw(
            _("No Stock Entry Type found. Please create at least one 'Stock Entry Type' (Setup → Stock Entry Type) "
              "or adjust mapping for purpose '{0}' in create_se_from_material_request").format(se_purpose)
        )

    # 5. Basic validation: for some purposes ensure target/source warehouses exist
    #   - Material Receipt: t_warehouse required
    #   - Material Issue: s_warehouse required
    #   - Material Transfer: both s_warehouse and t_warehouse required
    missing_wh_rows = []
    for idx, r in enumerate(items_to_add, start=1):
        if se_purpose == "Material Receipt" and not r.get("t_warehouse"):
            missing_wh_rows.append(idx)
        elif se_purpose == "Material Issue" and not r.get("s_warehouse"):
            missing_wh_rows.append(idx)
        elif se_purpose.startswith("Material Transfer") and (not r.get("s_warehouse") or not r.get("t_warehouse")):
            missing_wh_rows.append(idx)

    if missing_wh_rows:
        frappe.throw(
            _("Cannot create Stock Entry: missing warehouse(s) for rows: {0}. Check MR.from_warehouse or item.warehouse").format(
                ", ".join(map(str, missing_wh_rows))
            )
        )

    # 6. Create & submit Stock Entry (attempt auto-submit)
    try:
        se = frappe.new_doc("Stock Entry")
        se.purpose = se_purpose
        se.stock_entry_type = set_type
        se.material_request = doc.name

        if getattr(doc, "company", None):
            se.company = doc.company

        se.posting_date = getattr(doc, "transaction_date", None) or nowdate()
        se.posting_time = nowtime()
        se.use_multi_level_bom = 0

        for r in items_to_add:
            se.append("items", r)

        # Insert with ignore_permissions so creation does not fail on permission checks
        se.insert(ignore_permissions=True)

        # Now submit while forcing ignore_permissions flag (so submit bypasses permission checks)
        prev_flag = getattr(frappe.flags, "ignore_permissions", False)
        try:
            frappe.flags.ignore_permissions = True
            se.submit()
        finally:
            # restore previous flag value
            frappe.flags.ignore_permissions = prev_flag

        # 7. Optionally set a boolean flag on MR to mark SE creation (if column exists)
        try:
            if frappe.db.has_column("Material Request", "custom_se_created"):
                frappe.db.set_value("Material Request", doc.name, "custom_se_created", 1)
        except Exception:
            # non-fatal
            frappe.log(_("Failed to set custom_se_created for MR {0} (non-fatal)").format(doc.name))

        frappe.msgprint(_("Stock Entry {0} created and submitted from Material Request {1}").format(se.name, doc.name))
        return se.name

    except Exception:
        # log error to Error Log and re-raise for visibility
        frappe.log_error(frappe.get_traceback(), _("Failed to create/submit Stock Entry for MR {0}").format(doc.name))
        raise
    
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

@frappe.whitelist()
def get_warehouses_with_stock(item_code, min_qty=0, company=None):
    """
    Return list of warehouse names that have actual_qty > min_qty for given item_code.
    (Useful for ajax calls)
    """
    if not item_code:
        return []

    try:
        min_qty = float(min_qty)
    except Exception:
        min_qty = 0
    warehous = ['main warehouse - S','DOBROESTI NOU - S','VICTORIEI - S']
    filters = [["item_code", "=", item_code], ["warehouse", "in", warehous], ["actual_qty", ">", min_qty]]
    # If you store company on Bin, uncomment:
    # if company:
    #     filters.append(["company", "=", company])

    bins = frappe.get_all("Bin", filters=filters, fields=["warehouse"])
    
    warehouses = sorted({b["warehouse"] for b in bins if b.get("warehouse")})
    return warehouses
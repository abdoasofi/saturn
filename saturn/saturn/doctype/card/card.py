# Copyright (c) 2025, Asofi and contributors
# For license information, please see license.txt


import frappe
from frappe.model.document import Document
import json
import io
import os
import uuid
import shutil

from docx import Document as DocxDocument
from docx.shared import Mm, Pt
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
import qrcode
from frappe.utils import get_url, get_site_path

class Card(Document):
    def before_save(self):
        """get doc_card fields which will be used as a filters in Print Cards MultiSelectDialog"""
        fields = frappe.get_all(
            "DocField",
            fields=["fieldname", "default"],
            filters={"parent": self.doctype_card},
            or_filters={"in_standard_filter": 1, "in_list_view": 1},
        )

        fields = {field["fieldname"]: field["default"] for field in fields}
        self.fields = json.dumps(fields)


@frappe.whitelist()
def set_card_filters(card_name, filters, starting_value_for_autonumbering):
    user = frappe.session.user
    doctype = "Card Use Log"
    card_log_name = frappe.db.exists(doctype, {"card": card_name, "user": user})

    if card_log_name:
        card_log = frappe.get_doc(doctype, card_log_name)
    else:
        card_log = frappe.get_doc(
            {
                "doctype": doctype,
                "card": card_name,
                "user": user,
            }
        )

    card_log.filters = filters
    card_log.starting_value_for_autonumbering = starting_value_for_autonumbering
    card_log.save(ignore_permissions=True)
    frappe.db.commit()


@frappe.whitelist()
def save_filters(doc_name, filters):
    doc = frappe.get_doc("Card", doc_name)
    doc.filters = filters
    doc.save(ignore_permissions=True)
    return True

# أسفل الكود الحالي أضف الدالة التالية:

@frappe.whitelist()
def export_labels_docx(card_name):
    """
    Generate a DOCX file with labels for the selected documents
    - reads Card Use Log for current user to get filters
    - fetches documents from card.doctype_card
    - builds a simple two-column layout per label (left: details, right: image+QR+code)
    - saves to public/files and returns URL
    """

    # load card config
    card = frappe.get_doc("Card", card_name)

    # get Card Use Log for current user
    user = frappe.session.user
    card_log_name = frappe.db.exists("Card Use Log", {"card": card_name, "user": user})
    if not card_log_name:
        frappe.throw("No Card Use Log found for the current user. Please select items first using Print Cards dialog.")

    card_log = frappe.get_doc("Card Use Log", card_log_name)
    raw_filters = card_log.filters or card.filters or ""
    # try parse filters robustly
    try:
        filters_obj = json.loads(raw_filters) if raw_filters else {}
    except Exception:
        # final attempt: maybe it's the stringified object with single quotes -> unsafe, try replace
        try:
            filters_obj = json.loads(raw_filters.replace("'", '"'))
        except Exception:
            frappe.throw("Unable to parse filters from Card Use Log.")

    doctype = card.doctype_card

    # build filters for frappe.get_all
    if isinstance(filters_obj, dict):
        filters = filters_obj
    elif isinstance(filters_obj, list):
        filters = {"name": ["in", filters_obj]}
    else:
        frappe.throw("Unsupported filters format.")

    # fetch docs (increase limit if needed)
    docs = frappe.get_all(doctype, filters=filters, fields=["*"], limit_page_length=2000)
    if not docs:
        frappe.throw("No documents found for selected filters.")

    # build docx
    docx = DocxDocument()
    section = docx.sections[0]
    # small margins
    section.top_margin = Mm(5)
    section.bottom_margin = Mm(5)
    section.left_margin = Mm(5)
    section.right_margin = Mm(5)

    # helper: safe getter
    def g(d, *keys):
        for k in keys:
            if d.get(k):
                return d.get(k)
        return ""

    for d in docs:
        # create a table row with two cells to mimic label sides
        table = docx.add_table(rows=1, cols=2)
        table.autofit = False

        left_cell = table.rows[0].cells[0]
        right_cell = table.rows[0].cells[1]

        # set approximate widths (تعديل حسب القياسات اللي تريدها)
        left_cell.width = Mm(120)   # المساحة الكبيرة للنص
        right_cell.width = Mm(40)   # العمود الصغير للصورة والـ QR

        # LEFT: main text (اسم الصنف - مواصفات - وصف)
        p = left_cell.paragraphs[0]
        title = g(d, "item_name", "name", "title", "description")
        run = p.add_run(str(title).upper())
        run.bold = True
        run.font.size = Pt(14)
        p.alignment = WD_PARAGRAPH_ALIGNMENT.LEFT

        # إضافات نصية (تعديل الحقول حسب doctype الفعلي)
        extra_fields = []
        # شائع: item_code, description, uom, size, color
        for key in ("item_code", "description", "uom", "size", "color"):
            if d.get(key):
                extra_fields.append(f"{d.get(key)}")

        for ef in extra_fields:
            p2 = left_cell.add_paragraph()
            r2 = p2.add_run(str(ef))
            r2.font.size = Pt(10)
            p2.alignment = WD_PARAGRAPH_ALIGNMENT.LEFT

        # RIGHT: صورة الصنف (إن وُجدت) ثم QR ثم كود الاسم
        # 1) صورة الصنف: نحاول إيجاد حقل شائع "image" أو "item_image" يحتوي على رابط / مسار
        image_added = False
        image_field = None
        for try_field in ("image", "item_image", "photo"):
            if d.get(try_field):
                image_field = d.get(try_field)
                break

        if image_field:
            try:
                # image_field غالبًا رابط / URL مثل /files/xxx.jpg أو full URL
                # نحاول الوصول إلى المجلد public/files إن كان مساراً نسبياً
                img_path = None
                if image_field.startswith("/files/") or image_field.startswith("files/"):
                    fname = os.path.basename(image_field)
                    candidate = get_site_path("public", "files", fname)
                    if os.path.exists(candidate):
                        img_path = candidate
                elif image_field.startswith("http"):
                    # تجاهل التحميل من الشبكة — لو تريد تحميل من URL لازم requests (خارج نطاق مثال سريع)
                    img_path = None
                else:
                    # قد يكون اسم ملف في files
                    candidate = get_site_path("public", "files", os.path.basename(image_field))
                    if os.path.exists(candidate):
                        img_path = candidate

                if img_path:
                    rp = right_cell.paragraphs[0]
                    rp_run = rp.add_run()
                    rp_run.add_picture(img_path, width=Mm(30))
                    image_added = True
            except Exception:
                image_added = False

        # 2) generate QR image from document name (or any other field you prefer)
        qr_value = d.get("name") or d.get("item_code") or ""
        qr = qrcode.QRCode(box_size=3, border=1)
        qr.add_data(str(qr_value))
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        bio = io.BytesIO()
        img.save(bio, format="PNG")
        bio.seek(0)

        # put QR under image (or at top if no image)
        qr_par = right_cell.add_paragraph()
        qr_run = qr_par.add_run()
        qr_run.add_picture(bio, width=Mm(30))

        # 3) code / name under QR
        code_par = right_cell.add_paragraph()
        code_run = code_par.add_run(str(qr_value))
        code_run.font.size = Pt(8)
        code_par.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER

        # small spacer between labels
        docx.add_paragraph()

    # save to temporary file and copy to public files
    filename = f"labels_{card_name}_{uuid.uuid4().hex[:8]}.docx"
    tmp_path = os.path.join("/tmp", filename)
    docx.save(tmp_path)

    public_dest = get_site_path("public", "files", filename)
    shutil.copy(tmp_path, public_dest)

    file_url = get_url("/files/" + filename)
    return {"url": file_url}

@frappe.whitelist()
def export_labels_docx_for_names(card_name, names):
    """
    Export DOCX for specific document names.
    args:
      card_name: Card docname (to read layout / config if needed)
      names: JSON array string of document names to export (e.g. '["ITEM-001","ITEM-002"]')
    returns: {"url": "/files/labels_....docx"}
    """
    import json, os, io, uuid, shutil
    from docx import Document as DocxDocument
    from docx.shared import Mm, Pt
    from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
    import qrcode
    from frappe.utils import get_url, get_site_path

    # parse names
    try:
        names_list = json.loads(names) if isinstance(names, str) else names
    except Exception:
        frappe.throw("Invalid 'names' parameter. Expecting JSON array.")

    if not names_list:
        frappe.throw("No items selected for export.")

    # read card config (optional)
    card = frappe.get_doc("Card", card_name)

    doctype = card.doctype_card
    # fetch those docs
    docs = frappe.get_all(doctype, filters={"name": ["in", names_list]}, fields=["*"], limit_page_length=2000)
    if not docs:
        frappe.throw("No documents found for the given names.")

    # Build docx (similar to earlier implementation)
    docx = DocxDocument()
    section = docx.sections[0]
    section.top_margin = Mm(5)
    section.bottom_margin = Mm(5)
    section.left_margin = Mm(5)
    section.right_margin = Mm(5)

    def g(d, *keys):
        for k in keys:
            if d.get(k):
                return d.get(k)
        return ""

    import io as _io
    for d in docs:
        table = docx.add_table(rows=1, cols=2)
        table.autofit = False
        left_cell = table.rows[0].cells[0]
        right_cell = table.rows[0].cells[1]

        left_cell.width = Mm(120)
        right_cell.width = Mm(40)

        p = left_cell.paragraphs[0]
        title = g(d, "item_name", "name", "title", "description")
        run = p.add_run(str(title).upper())
        run.bold = True
        run.font.size = Pt(14)
        p.alignment = WD_PARAGRAPH_ALIGNMENT.LEFT

        extra_fields = []
        for key in ("item_code", "description", "uom", "size", "color"):
            if d.get(key):
                extra_fields.append(f"{d.get(key)}")

        for ef in extra_fields:
            p2 = left_cell.add_paragraph()
            r2 = p2.add_run(str(ef))
            r2.font.size = Pt(10)
            p2.alignment = WD_PARAGRAPH_ALIGNMENT.LEFT

        # image attempt
        image_field = None
        for try_field in ("image", "item_image", "photo"):
            if d.get(try_field):
                image_field = d.get(try_field)
                break
        if image_field:
            try:
                img_path = None
                if image_field.startswith("/files/") or image_field.startswith("files/"):
                    fname = os.path.basename(image_field)
                    candidate = get_site_path("public", "files", fname)
                    if os.path.exists(candidate):
                        img_path = candidate
                if img_path:
                    rp = right_cell.paragraphs[0]
                    rp_run = rp.add_run()
                    rp_run.add_picture(img_path, width=Mm(30))
            except Exception:
                pass

        qr_value = d.get("name") or d.get("item_code") or ""
        qr = qrcode.QRCode(box_size=3, border=1)
        qr.add_data(str(qr_value))
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        bio = _io.BytesIO()
        img.save(bio, format="PNG")
        bio.seek(0)

        # save tmp qr
        tmp_qr = os.path.join("/tmp", f"qr_{uuid.uuid4().hex}.png")
        with open(tmp_qr, "wb") as f:
            f.write(bio.getbuffer())

        right_cell.add_paragraph().add_run().add_picture(tmp_qr, width=Mm(30))
        os.remove(tmp_qr)

        code_par = right_cell.add_paragraph()
        code_run = code_par.add_run(str(qr_value))
        code_run.font.size = Pt(8)
        code_par.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER

        docx.add_paragraph()

    filename = f"labels_{card_name}_{uuid.uuid4().hex[:8]}.docx"
    tmp_path = os.path.join("/tmp", filename)
    docx.save(tmp_path)
    public_dest = get_site_path("public", "files", filename)
    shutil.copy(tmp_path, public_dest)
    file_url = get_url("/files/" + filename)
    return {"url": file_url}
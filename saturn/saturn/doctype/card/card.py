import frappe
from frappe.model.document import Document
import json
import io
import os
import uuid
import shutil
import re
from html import unescape

# --- External libs ---
from docx import Document as DocxDocument
from docx.shared import Mm, Pt, Inches, Cm # Make sure Inches is imported
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
import qrcode
from bs4 import BeautifulSoup
from frappe.utils import get_url, get_site_path

class Card(Document):
    def before_save(self):
        if not self.doctype_card:
            return
        try:
            fields = frappe.get_all(
                "DocField",
                fields=["fieldname", "default"],
                filters={"parent": self.doctype_card},
                or_filters={"in_standard_filter": 1, "in_list_view": 1},
            )
            fields = {f["fieldname"]: f.get("default") for f in fields}
            self.fields = json.dumps(fields)
        except Exception as e:
            frappe.log_error(f"Card.before_save failed: {e}", "Card.before_save")


# ... (set_card_filters and save_filters remain the same) ...
@frappe.whitelist()
def set_card_filters(card_name, filters, starting_value_for_autonumbering=None):
    user = frappe.session.user
    doctype = "Card Use Log"
    card_log_name = frappe.db.exists(doctype, {"card": card_name, "user": user})
    if card_log_name:
        card_log = frappe.get_doc(doctype, card_log_name)
    else:
        card_log = frappe.get_doc({"doctype": doctype, "card": card_name, "user": user})
    card_log.filters = filters
    if starting_value_for_autonumbering:
        card_log.starting_value_for_autonumbering = starting_value_for_autonumbering
    card_log.save(ignore_permissions=True)
    frappe.db.commit()

@frappe.whitelist()
def save_filters(doc_name, filters):
    doc = frappe.get_doc("Card", doc_name)
    doc.filters = filters
    doc.save(ignore_permissions=True)
    return True


@frappe.whitelist()
def export_labels_docx_for_names(card_name, names):
    try:
        names_list = json.loads(names) if isinstance(names, str) else names
    except Exception:
        frappe.throw("Invalid 'names' parameter. Expecting a JSON array of document names.")

    if not names_list:
        frappe.throw("No items selected for export.")

    card = frappe.get_doc('Card', card_name)
    if not card.layout:
        frappe.throw("The selected Card has no layout defined. Please add an HTML layout.")
    
    doctype = card.doctype_card
    if not doctype:
        frappe.throw('Card has no target DocType set (doctype_card).')
        
    # === NEW: Get label dimensions from Card doc ===
    label_width = card.get("label_width") or 0
    label_height = card.get("label_height") or 0
    
    docs = frappe.get_all(doctype, filters={"name": ["in", names_list]}, fields=["*"])
    if not docs:
        frappe.throw('No documents found for the given names.')

    docx = DocxDocument()
    section = docx.sections[0]
    # Adjust margins if needed
    section.top_margin = Mm(5)
    section.bottom_margin = Mm(5)
    section.left_margin = Mm(5)
    section.right_margin = Mm(5)

    for doc_data in docs:
        try:
            rendered_html = frappe.render_template(card.layout, {"doc": doc_data})
        except Exception as e:
            frappe.log_error(f"Jinja template rendering failed for {doc_data.name}: {e}", "Dynamic DOCX Export")
            docx.add_paragraph(f"Error rendering template for {doc_data.name}. Check layout syntax.")
            docx.add_page_break()
            continue

        soup = BeautifulSoup(rendered_html, 'lxml')
        html_table = soup.find('table')

        if not html_table:
            docx.add_paragraph(soup.get_text())
        else:
            html_rows = html_table.find_all('tr')
            if not html_rows: continue
            
            num_rows = len(html_rows)
            num_cols = len(html_rows[0].find_all(['td', 'th'])) if num_rows > 0 else 0
            if num_cols == 0: continue

            docx_table = docx.add_table(rows=num_rows, cols=num_cols)
            docx_table.style = 'Table Grid'
            docx_table.alignment = WD_TABLE_ALIGNMENT.CENTER
            
            # === NEW: Apply fixed dimensions if specified ===
            if label_width > 0 and label_height > 0:
                try:
                    # Set total table width
                    docx_table.width = Inches(label_width)
                    # Distribute width evenly across columns
                    col_width_val = Inches(label_width / num_cols)
                    for col in docx_table.columns:
                        col.width = col_width_val
                    
                    # Distribute height evenly across rows
                    row_height_val = Inches(label_height / num_rows)
                    for row in docx_table.rows:
                        row.height = row_height_val
                except Exception as e:
                    frappe.log_error(f"Failed to set table dimensions: {e}", "Dynamic DOCX Export")

            for i, html_row in enumerate(html_rows):
                html_cells = html_row.find_all(['td', 'th'])
                for j, html_cell in enumerate(html_cells):
                    if j >= num_cols: continue
                    docx_cell = docx_table.cell(i, j)
                    process_cell_content(docx_cell, html_cell, doc_data)

            # Cell merging logic (remains the same)
            merged_cells = set()
            for r_idx, html_row in enumerate(html_rows):
                html_cells = html_row.find_all(['td', 'th'])
                c_idx = 0
                for html_cell in html_cells:
                    while (r_idx, c_idx) in merged_cells: c_idx += 1
                    if c_idx >= num_cols: continue
                    rowspan = int(html_cell.get('rowspan', 1))
                    colspan = int(html_cell.get('colspan', 1))
                    if rowspan > 1 or colspan > 1:
                        start_cell = docx_table.cell(r_idx, c_idx)
                        end_cell = docx_table.cell(r_idx + rowspan - 1, c_idx + colspan - 1)
                        start_cell.merge(end_cell)
                        for rs in range(rowspan):
                            for cs in range(colspan):
                                if rs == 0 and cs == 0: continue
                                merged_cells.add((r_idx + rs, c_idx + cs))
                    c_idx += colspan
        
        docx.add_paragraph()

    # Saving logic (remains the same)
    filename = f"labels_{card_name}_{uuid.uuid4().hex[:8]}.docx"
    tmp_path = os.path.join('/tmp', filename)
    docx.save(tmp_path)
    public_dest = get_site_path('public', 'files', filename)
    try:
        shutil.copy(tmp_path, public_dest)
    except Exception as e:
        frappe.log_error(f"Failed copying docx to public/files: {e}", "Dynamic DOCX Export")
        frappe.throw('Failed to save the generated file on the server. Check permissions.')

    file_url = get_url('/files/' + filename)
    return {"url": file_url}

# ... (process_cell_content function remains the same) ...
def process_cell_content(docx_cell, html_cell, doc_data):
    docx_cell.text = ''
    align_map = {
        'center': WD_PARAGRAPH_ALIGNMENT.CENTER, 'right': WD_PARAGRAPH_ALIGNMENT.RIGHT, 'left': WD_PARAGRAPH_ALIGNMENT.LEFT
    }
    cell_align = html_cell.get('align')
    if html_cell.get('style'):
        style = html_cell['style'].lower()
        if 'text-align: center' in style: cell_align = 'center'
        if 'text-align: right' in style: cell_align = 'right'
        if 'text-align: left' in style: cell_align = 'left'

    qr_div = html_cell.find('div', class_='qr-code')
    if qr_div:
        qr_value = qr_div.get('data-value', '')
        if qr_value:
            try:
                p = docx_cell.add_paragraph()
                if cell_align: p.alignment = align_map.get(cell_align, WD_PARAGRAPH_ALIGNMENT.LEFT)
                qr = qrcode.QRCode(box_size=6, border=1)
                qr.add_data(str(qr_value))
                qr.make(fit=True)
                img = qr.make_image(fill_color='black', back_color='white')
                bio = io.BytesIO()
                img.save(bio, format='PNG')
                bio.seek(0)
                # Let the table cell size control the QR size implicitly
                p.add_run().add_picture(bio, height=Inches(0.8)) # You can set a relative size
            except Exception as e:
                frappe.log_error(f"QR generation failed for value '{qr_value}': {e}", "Dynamic DOCX Export")
                docx_cell.add_paragraph(f"[QR Error: {qr_value}]")
        qr_div.decompose()

    img_tag = html_cell.find('img')
    if img_tag:
        src = img_tag.get('src', '')
        if src.startswith('/files/'):
            try:
                p = docx_cell.add_paragraph()
                if cell_align: p.alignment = align_map.get(cell_align, WD_PARAGRAPH_ALIGNMENT.LEFT)
                fname = os.path.basename(src)
                img_path = get_site_path('public', 'files', fname)
                if os.path.exists(img_path):
                     # Image will scale to fit the cell, can provide a width hint
                    p.add_run().add_picture(img_path, width=Inches(2.5))
                else:
                    docx_cell.add_paragraph(f"[Image not found: {fname}]")
            except Exception as e:
                frappe.log_error(f"Image insertion failed for '{src}': {e}", "Dynamic DOCX Export")
                docx_cell.add_paragraph(f"[Image Error: {src}]")
        img_tag.decompose()
        
    text = html_cell.get_text(separator='\n', strip=True)
    if text:
        p = docx_cell.add_paragraph()
        if cell_align: p.alignment = align_map.get(cell_align, WD_PARAGRAPH_ALIGNMENT.LEFT)
        is_bold = bool(html_cell.find(['b', 'strong']))
        font_size = Pt(10)
        run = p.add_run(text)
        run.bold = is_bold
        run.font.size = font_size

    docx_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
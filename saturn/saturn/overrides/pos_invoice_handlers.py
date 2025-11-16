# saturn/saturn/overrides/pos_invoice_handlers.py
import frappe

def remove_taxes_if_not_applied(doc, method=None):
    """
    Hook: If apply_taxes is False on POS Invoice, clear taxes fields
    and ensure grand_total = net_total before saving/submitting.
    This runs for POS Invoice doc events (validate and before_submit recommended).
    """
    try:
        apply_taxes = getattr(doc, "apply_taxes", None)
        # treat '0', 0, False as not applied
        if apply_taxes in (0, "0", False):
            # clear tax table
            if hasattr(doc, "taxes"):
                doc.set("taxes", [])

            # reset tax totals
            doc.total_taxes_and_charges = 0.0
            doc.tax_amount = 0.0
            doc.taxes_and_charges = ""
            # set grand_total to net_total
            # ensure net_total present (calculate if needed)
            try:
                # some code paths expect calculate_taxes_and_totals to be available
                if hasattr(doc, "calculate_taxes_and_totals"):
                    # If you call it here after emptying taxes, it will recompute totals (without taxes)
                    doc.calculate_taxes_and_totals()
            except Exception:
                # best-effort: just set grand_total
                doc.grand_total = doc.net_total or 0.0

            # finally force grand_total
            doc.grand_total = doc.net_total or 0.0

    except Exception:
        frappe.log_error(frappe.get_traceback(), "saturn.remove_taxes_if_not_applied")
        # don't stop normal flow - fail silently (but logged)

# saturn/saturn/overrides/pos_invoice_handlers.py
import frappe
from frappe.utils import flt

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


def apply_additional_discount_amount(doc, method=None):
    """
    If additional_discount_amount is set on POS Invoice, compute equivalent percentage
    and trigger calculate_taxes_and_totals (if available) so totals & taxes are recomputed.
    This runs on validate / before_submit to ensure final invoice respects the amount discount.
    """
    try:
        amt = flt(getattr(doc, "additional_discount_amount", 0.0))
        base = flt(getattr(doc, "net_total", 0.0))
        if amt and base:
            # compute percentage
            perc = (amt / base) * 100.0
            # set percentage field so other logic that uses percentage continues to work
            doc.additional_discount_percentage = flt(perc, 6)
        elif amt and not base:
            # if base = 0, set percentage to 0 and let amount be stored (edge case)
            doc.additional_discount_percentage = 0.0

        # After updating the fields, try to recalc totals (best effort)
        try:
            if hasattr(doc, "calculate_taxes_and_totals"):
                doc.calculate_taxes_and_totals()
        except Exception:
            # if recalc fails silently, ensure grand_total is consistent
            if hasattr(doc, "net_total"):
                doc.grand_total = doc.net_total or 0.0
    except Exception:
        frappe.log_error(frappe.get_traceback(), "saturn.apply_additional_discount_amount")
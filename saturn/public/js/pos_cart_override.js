// saturn/public/js/pos_cart_override.js
(function () {
  frappe.provide("saturn.pos");

  let tries = 0;
  function init() {
    tries++;
    if (typeof erpnext === "undefined" || !erpnext.PointOfSale || !erpnext.PointOfSale.ItemCart) {
      if (tries < 80) return setTimeout(init, 150);
      return console.warn("saturn: ItemCart class not found, giving up.");
    }

    const ItemCart = erpnext.PointOfSale.ItemCart;

    // حفظ النسخ الأصلية
    const orig_make_cart_totals_section = ItemCart.prototype.make_cart_totals_section;
    const orig_bind_events = ItemCart.prototype.bind_events;
    const orig_update_totals_section = ItemCart.prototype.update_totals_section;

    // === 1) Override: بعد إنشاء التوتالز نضيف checkbox ===
    ItemCart.prototype.make_cart_totals_section = function () {
      // استدعاء الأصلي يبني الـ DOM
      orig_make_cart_totals_section.apply(this, arguments);

      // تأكد أن الـ DOM موجود
      try {
        // إضافة عنصر التبديل داخل هذه الـ section (بعد net total)
        const $tax_toggle = $(`
          <div class="tax-toggle-container" style="display:flex; align-items:center; gap:0.5rem; margin-top:0.5rem;">
            <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
              <input type="checkbox" class="toggle-tax" checked />
              <span class="apply-tax-label">${__("Apply Tax")}</span>
            </label>
          </div>
        `);
        this.$totals_section.find(".net-total-container").after($tax_toggle);

        // حفظ الحالة الافتراضية
        if (typeof this.apply_taxes === "undefined") this.apply_taxes = true;
        // sync UI
        this.$totals_section.find(".toggle-tax").prop("checked", this.apply_taxes);
      } catch (e) {
        console.warn("saturn: cannot append tax toggle", e);
      }
    };

    // === 2) Override bind_events: نربط handler للـ checkbox ونتأكد من ضبط الحقل قبل checkout ===
    ItemCart.prototype.bind_events = function () {
      const me = this;

      // Initialize apply_taxes default
      if (typeof this.apply_taxes === "undefined") this.apply_taxes = true;

      // attach handlers first so they run BEFORE original handlers (important for checkout)
      // checkbox change
      this.$component.on("change.saturn_tax", ".toggle-tax", function () {
        me.apply_taxes = $(this).is(":checked");
        // إعادة رسم totals وفق الحالة
        me.update_totals_section(me.events.get_frm());
      });

      // intercept checkout click -> set apply_taxes on the frm BEFORE original handler runs
      this.$component.on("click.saturn_tax", ".checkout-btn", function (e) {
        // If button is disabled (style), ignore
        const style = $(this).attr("style") || "";
        if (style.indexOf("--blue-500") == -1) return;

        const frm = me.events.get_frm();
        // set apply_taxes field on the doc (so server handlers can read it)
        try {
          frappe.model.set_value(frm.doc.doctype, frm.doc.name, "apply_taxes", me.apply_taxes ? 1 : 0);
        } catch (err) {
          console.warn("saturn: failed to set apply_taxes on doc:", err);
        }

        // if not applying taxes, also clear tax fields locally (so original checkout sees no taxes)
        if (!me.apply_taxes) {
          try {
            frappe.model.set_value(frm.doc.doctype, frm.doc.name, "taxes", []);
            frappe.model.set_value(frm.doc.doctype, frm.doc.name, "tax_amount", 0);
            frappe.model.set_value(frm.doc.doctype, frm.doc.name, "total_taxes_and_charges", 0);
            frappe.model.set_value(frm.doc.doctype, frm.doc.name, "taxes_and_charges", "");
            // set grand_total to net_total locally (for the UI and submission)
            frappe.model.set_value(frm.doc.doctype, frm.doc.name, "grand_total", frm.doc.net_total || 0);
          } catch (err) {
            console.warn("saturn: failed to clear taxes locally", err);
          }
        }
        // do NOT stop propagation; original handler will run after (we ran first)
      });

      // ثم نادِيّ النسخة الأصلية حتى تبقى باقي الوظائف كما هي
      orig_bind_events.apply(this, arguments);
    };

    // === 3) Override update_totals_section: عرض/اخفاء الضرايب و Grand Total بحسب الـ checkbox ===
    ItemCart.prototype.update_totals_section = function (frm) {
      // call original to compute and render
      orig_update_totals_section.apply(this, arguments);

      // sync UI with apply_taxes flag
      const apply_taxes = (typeof this.apply_taxes === "undefined") ? true : this.apply_taxes;

      // hide taxes rows if apply_taxes == false
      if (!apply_taxes) {
        // hide taxes container
        this.$totals_section.find(".taxes-container").css("display", "none").html("");
        // set displayed grand total = net_total
        const currency = this.events.get_frm().doc.currency;
        const net = (frm && frm.doc) ? frm.doc.net_total || 0 : 0;
        this.$totals_section.find(".grand-total-container").html(`<div>${__("Grand Total")}</div><div>${format_currency(net, currency)}</div>`);
        // also sync numpad
        this.$numpad_section.find(".numpad-grand-total").html(`<div>${__("Grand Total")}: <span>${format_currency(net, currency)}</span></div>`);
      } else {
        // ensure taxes container visible (orig already rendered taxes)
        // nothing to do: original rendering stands
      }

      // sync checkbox UI if not present
      const $chk = this.$totals_section.find(".toggle-tax");
      if ($chk.length) $chk.prop("checked", apply_taxes);
    };

    console.log("saturn: POS ItemCart override loaded");
  }

  init();
})();

// /apps/saturn/saturn/public/js/pos_discount_override.js
// Saturn POS — fixed amount-discount override (stable, guarded)

(function () {
  frappe.provide("saturn.pos");
  let tries = 0;
  function L(...args) { if (window.console) console.log("saturn:", ...args); }

  function init() {
    tries++;
    if (typeof erpnext === "undefined" || !erpnext.PointOfSale || !erpnext.PointOfSale.ItemCart) {
      if (tries < 80) return setTimeout(init, 150);
      return console.warn("saturn: POS classes not ready - abort");
    }
    L("init: pos_discount_override (fixed)");

    const amount_html = `
      <div class="saturn-amount-only" data-saturn-processed="0" style="margin-top:0.5rem; display:flex; flex-direction:column; gap:0.4rem;">
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <button type="button" class="btn btn-sm btn-outline saturn-amount-btn" title="${__("Discount by Amount / خصم بالمبلغ")}">
            ${__("خصم بالمبلغ")}
          </button>
          <div style="flex:1"></div>
        </div>
        <div class="saturn-amount-input" style="display:none; margin-top:0.5rem;">
          <div class="add-discount-field-amount"></div>
        </div>
      </div>`;

    function debounce(fn, wait) { let t; return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); }; }

    // Guarded model setter to avoid re-entrant update loops
    function guarded_set_values(frm, values) {
      try {
        const cart = window.cur_pos && window.cur_pos.cart ? window.cur_pos.cart : null;
        if (!frm) return;
        if (cart && cart._saturn_updating) {
          L("guarded_set_values: skip (already updating)");
          return;
        }
        if (cart) cart._saturn_updating = true;

        const promises = [];
        if ("additional_discount_amount" in values) {
          promises.push(frappe.model.set_value(frm.doc.doctype, frm.doc.name, "additional_discount_amount", values.additional_discount_amount));
        }
        if ("additional_discount_percentage" in values) {
          promises.push(frappe.model.set_value(frm.doc.doctype, frm.doc.name, "additional_discount_percentage", values.additional_discount_percentage));
        }

        Promise.all(promises).finally(() => {
          setTimeout(() => {
            if (cart) cart._saturn_updating = false;
            L("guard cleared");
          }, 240);
        });
      } catch (e) {
        console.warn("saturn: guarded_set_values error", e);
        if (window.cur_pos && window.cur_pos.cart) window.cur_pos.cart._saturn_updating = false;
      }
    }

    // Debounced final apply (uses guarded setter)
    const safe_apply_amount = debounce(function (frm, amt) {
      try {
        if (!frm) return;
        const base = flt(frm.doc.net_total || 0);
        let perc = 0;
        if (base > 0) perc = (amt / base) * 100.0;
        L("safe_apply_amount -> amt:", amt, "perc:", perc, "base:", base);

        guarded_set_values(frm, {
          additional_discount_amount: flt(amt, 6),
          additional_discount_percentage: flt(perc, 6),
        });

        // Update totals after model write (best effort)
        requestAnimationFrame(() => {
          try {
            const cart = window.cur_pos && window.cur_pos.cart ? window.cur_pos.cart : null;
            if (cart && typeof cart.update_totals_section === "function") {
              cart.update_totals_section(frm);
            } else {
              L("update_totals_section missing");
            }
          } catch (e) { console.warn("saturn: update_totals_section error", e); }
        });

        frappe.show_alert({ message: __("Applied discount amount: {0}", [format_currency(amt, frm.doc.currency)]), indicator: "green" });
      } catch (e) {
        console.warn("saturn: safe_apply_amount error", e);
      }
    }, 220);

    // Preview totals in UI without writing to model (throttled via rAF)
    let pending_preview = null;
    function preview_totals_in_ui(frm, amt) {
      try {
        if (pending_preview) cancelAnimationFrame(pending_preview);
        pending_preview = requestAnimationFrame(() => {
          try {
            const cart = window.cur_pos && window.cur_pos.cart ? window.cur_pos.cart : null;
            if (!cart || !frm) return;
            const base_net = parseFloat(frm.doc.net_total || 0);
            const new_net = Math.max(base_net - (isFinite(amt) ? amt : 0), 0);

            let tax_rate = 0.21;
            if (Array.isArray(frm.doc.taxes) && frm.doc.taxes.length) {
              const r = parseFloat(frm.doc.taxes[0].rate) || parseFloat(frm.doc.taxes[0].rate_percent) || null;
              if (r !== null && !isNaN(r)) tax_rate = (r / 100) || 0.21;
            }
            const tax_amt = parseFloat((new_net * tax_rate).toFixed(6));
            const new_grand = parseFloat((new_net + tax_amt).toFixed(6));

            const $totals = cart.$totals_section && cart.$totals_section.length ? cart.$totals_section : $(".cart-totals-section");
            if ($totals && $totals.length) {
              $totals.find(".net-total-container").html(`<div>${__("Net Total")}</div><div>${format_currency(new_net, frm.doc.currency)}</div>`);
              $totals.find(".taxes-container").css("display", "flex").html(`<div class="tax-row"><div class="tax-label">${__("Tax")}</div><div class="tax-value">${format_currency(tax_amt, frm.doc.currency)}</div></div>`);
              $totals.find(".grand-total-container").html(`<div>${__("Grand Total")}</div><div>${format_currency(new_grand, frm.doc.currency)}</div>`);
            }
          } catch (e) { console.warn("saturn: preview_totals_in_ui error", e); }
        });
      } catch (e) { console.warn("saturn: preview wrapper error", e); }
    }

    // Ensure small Apply button exists
    function ensure_apply_button($placeholder, cart, frm) {
      try {
        if ($placeholder.find(".saturn-apply-amount").length) return $placeholder.find(".saturn-apply-amount");
        const $btn = $(`<div style="margin-top:0.3rem"><button class="btn btn-xs btn-primary saturn-apply-amount">${__("Apply")}</button></div>`);
        $placeholder.append($btn);
        $btn.on("click", function () {
          const amt = flt((cart && cart.saturn_amount_field_control) ? cart.saturn_amount_field_control.get_value() : 0);
          safe_apply_amount(frm, amt);
        });
        return $btn;
      } catch (e) { console.warn("saturn: ensure_apply_button", e); }
    }

    // Create or sync the control for a given wrapper
    function create_or_sync_amount_control_for($wrapper, max_attempts = 20, attempt = 0) {
      return new Promise((resolve, reject) => {
        try {
          const cart = window.cur_pos && window.cur_pos.cart ? window.cur_pos.cart : null;
          const $inserted = $wrapper.next('.saturn-amount-only');
          if (!$inserted.length) return reject('no-inserted');
          // mark processed so observer won't re-insert
          $inserted.attr('data-saturn-processed', '1');

          const $placeholder = $inserted.find('.add-discount-field-amount').first();
          if (!$placeholder.length) return reject('no-placeholder');

          const frm = (cart && cart.events && typeof cart.events.get_frm === 'function') ? cart.events.get_frm() : (window.cur_pos && window.cur_pos.frm ? window.cur_pos.frm : null);
          if (!frm) {
            if (attempt < max_attempts) return setTimeout(() => create_or_sync_amount_control_for($wrapper, max_attempts, attempt + 1).then(resolve).catch(reject), 120);
            return reject('frm-not-ready');
          }

          // If core input exists, reuse (attach guarded handlers)
          const $coreAmt = $wrapper.find("input[name*='additional_discount_amount'], input[data-fieldname*='additional_discount_amount']").filter(":visible").first();
          if ($coreAmt && $coreAmt.length) {
            $coreAmt.off('.saturn_amt').on('change.saturn_amt input.saturn_amt', function () {
              try {
                const cartNow = window.cur_pos && window.cur_pos.cart ? window.cur_pos.cart : null;
                if (cartNow && cartNow._saturn_updating) { L('core handler skipped due to guard'); return; }
                let raw = $(this).val();
                let amt = parseFloat(String(raw).replace(',', '.')) || 0;
                const base = frm.doc.net_total || 0;
                if (amt < 0) { frappe.msgprint({ message: __('Discount amount cannot be negative.'), indicator: 'red' }); amt = 0; $(this).val(0); }
                if (amt > base && base > 0) { frappe.msgprint({ message: __('Discount amount is greater than net total. It will be capped.'), indicator: 'orange' }); amt = base; $(this).val(amt); }
                safe_apply_amount(frm, amt);
              } catch (e) { console.warn('saturn: coreAmt handler error', e); }
            });
            $coreAmt.val(frm.doc.additional_discount_amount || '');
            return resolve();
          }

          // Reuse existing saturn control
          if (cart && cart.saturn_amount_field_control) {
            cart.saturn_amount_field_control.set_value(frm.doc.additional_discount_amount || '');
            return resolve();
          }

          // Create control
          if (!cart) return reject('no-cart');
          cart.saturn_amount_field_control = frappe.ui.form.make_control({
            df: {
              label: __('Discount Amount'),
              fieldtype: 'Currency',
              options: frm.doc.currency,
              input_class: 'input-xs',
              placeholder: __('Enter discount amount')
            },
            parent: $placeholder[0],
            render_input: true
          });
          cart.saturn_amount_field_control.toggle_label(false);

          // Handlers: preview on input, apply on blur/enter, plus Apply button
          const $input = cart.saturn_amount_field_control.$input;
          $input.off('.saturn_amt_preview');

          $input.on('input.saturn_amt_preview', function () {
            try {
              const raw = $(this).val();
              const amt = parseFloat(String(raw).replace(',', '.')) || 0;
              preview_totals_in_ui(frm, amt);
            } catch (e) { console.warn('saturn: preview input error', e); }
          });

          $input.on('keydown.saturn_amt_preview', function (ev) {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              const amt = flt(cart.saturn_amount_field_control.get_value() || 0);
              safe_apply_amount(frm, amt);
            }
          });

          $input.on('blur.saturn_amt_preview', function () {
            const amt = flt(cart.saturn_amount_field_control.get_value() || 0);
            safe_apply_amount(frm, amt);
          });

          // Apply button
          ensure_apply_button($inserted.find('.add-discount-field-amount').first().closest('.saturn-amount-input'), cart, frm);

          cart.saturn_amount_field_control.set_value(frm.doc.additional_discount_amount || '');
          return resolve();
        } catch (e) {
          console.warn('saturn: create_or_sync_amount_control_for error', e);
          return reject(e);
        }
      });
    }

    // Insert sibling block right after each Add Discount wrapper
    function attach_buttons_next_to_add_discount() {
      $('.add-discount-wrapper').each(function () {
        const $w = $(this);
        try {
          // if already attached and processed, just sync control
          if ($w.next('.saturn-amount-only').length) {
            const $ex = $w.next('.saturn-amount-only');
            if ($ex.attr('data-saturn-processed') !== '1') {
              $ex.attr('data-saturn-processed','1');
            }
            create_or_sync_amount_control_for($w).catch(()=>{});
            return;
          }
          // insert safely
          $w.after(amount_html);
          const $inserted = $w.next('.saturn-amount-only');
          $inserted.attr('data-saturn-processed','1');
          L('inserted amount block after add-discount-wrapper');

          $inserted.find('.saturn-amount-btn').off('.saturn').on('click.saturn', function () {
            const $inp = $inserted.find('.saturn-amount-input');
            if ($inp.is(':visible')) {
              $inp.slideUp(120);
            } else {
              create_or_sync_amount_control_for($w).then(() => {
                const $inp2 = $inserted.find('.saturn-amount-input');
                $inp2.stop(true,true).hide().slideDown(140);
                setTimeout(() => {
                  try {
                    const cart = window.cur_pos && window.cur_pos.cart ? window.cur_pos.cart : null;
                    if (cart && cart.saturn_amount_field_control) cart.saturn_amount_field_control.$input.focus();
                    else $inp2.find('input').first().focus();
                  } catch (e) {}
                }, 220);
              }).catch(err => { L('create control failed', err); });
            }
          });
        } catch (e) { console.warn("saturn: attach error", e); }
      });
    }

    // Observe DOM for re-renders (core may rebuild add-discount-wrapper)
    const mo = new MutationObserver((mutations) => {
      let relevant = false;
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          const $n = $(n);
          if ($n.is('.add-discount-wrapper') || $n.find('.add-discount-wrapper').length || $n.is('.saturn-amount-only') ) {
            relevant = true;
            break;
          }
        }
        if (relevant) break;
      }
      if (relevant) {
        // small debounce to allow core to stabilize
        setTimeout(() => attach_buttons_next_to_add_discount(), 80);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    $(document).ready(function () {
      attach_buttons_next_to_add_discount();
      L('initial attach done');
    });

    // Hook into core show/hide to reattach and sync
    try {
      const ItemCartProto = erpnext.PointOfSale.ItemCart.prototype;
      const orig_show = ItemCartProto.show_discount_control;
      const orig_hide = ItemCartProto.hide_discount_control;
      ItemCartProto.show_discount_control = function () {
        try { if (orig_show) orig_show.apply(this, arguments); } catch (e) {}
        setTimeout(()=>attach_buttons_next_to_add_discount(), 60);
      };
      ItemCartProto.hide_discount_control = function () {
        try { if (orig_hide) orig_hide.apply(this, arguments); } catch (e) {}
        const cart = window.cur_pos && window.cur_pos.cart ? window.cur_pos.cart : null;
        if (cart && cart.saturn_amount_field_control && cart.events && typeof cart.events.get_frm === 'function') {
          const frm = cart.events.get_frm();
          cart.saturn_amount_field_control.set_value(frm.doc.additional_discount_amount || '');
        }
      };
    } catch (e) {
      L('could not hook core show/hide', e);
    }

    L('pos_discount_override (fixed) installed');
  }

  init();
})();

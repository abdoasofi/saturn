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

    // === 1) Override: إضافة زر Fixed Amount Discount ===
    ItemCart.prototype.make_cart_totals_section = function () {
      // استدعاء الأصلي يبني الـ DOM
      orig_make_cart_totals_section.apply(this, arguments);

      // تأكد أن الـ DOM موجود
      try {
        // إضافة عنصر التبديل داخل هذه الـ section (بعد net total)
        const $tax_toggle = $(`
          <div class="tax-toggle-container">
            <label>
              <input type="checkbox" class="toggle-tax" checked />
              <span class="apply-tax-label">${__("Apply Tax")}</span>
            </label>
          </div>
        `);
        this.$totals_section.find(".net-total-container").after($tax_toggle);

        // إضافة زر Fixed Amount Discount
        const $fixedDiscountBtn = $(`
          <div class="add-fixed-discount-wrapper">
            ${this.get_discount_icon()} ${__("Fixed Amount Discount")}
          </div>
        `);
        
        // إضافة الزر بعد زر Add Discount مباشرة
        this.$totals_section.find(".add-discount-wrapper").after($fixedDiscountBtn);

        // حفظ الحالة الافتراضية
        if (typeof this.apply_taxes === "undefined") this.apply_taxes = true;
        if (typeof this.fixed_discount_amount === "undefined") this.fixed_discount_amount = 0;
        
        // sync UI
        this.$totals_section.find(".toggle-tax").prop("checked", this.apply_taxes);
      } catch (e) {
        console.warn("saturn: cannot append tax toggle or fixed discount", e);
      }
    };

    // === 2) Override bind_events ===
    ItemCart.prototype.bind_events = function () {
      const me = this;

      // Initialize apply_taxes default
      if (typeof this.apply_taxes === "undefined") this.apply_taxes = true;
      if (typeof this.fixed_discount_amount === "undefined") this.fixed_discount_amount = 0;

      // attach handlers first so they run BEFORE original handlers (important for checkout)
      // checkbox change - إصلاح كامل لتأثير Apply Tax
      this.$component.on("change.saturn_tax", ".toggle-tax", function () {
        me.apply_taxes = $(this).is(":checked");
        const frm = me.events.get_frm();
        
        if (!frm || !frm.doc) return;
        
        console.log("Apply Tax changed to:", me.apply_taxes, "Current net_total:", frm.doc.net_total);
        
        // تحديث حقل apply_taxes في المستند
        frappe.model.set_value(frm.doc.doctype, frm.doc.name, "apply_taxes", me.apply_taxes ? 1 : 0);
        
        if (me.apply_taxes) {
          // إذا تم تفعيل الضريبة - إعادة حساب كل شيء مع الضريبة
          frm.trigger("calculate_taxes_and_totals");

          // نعيد تطبيق الخصم بعد حساب الضرائب لضمان أن الضريبة تحسب على المبلغ بعد الخصم
          if (frm.doc.discount_amount > 0) {
            setTimeout(() => {
              me.apply_fixed_discount(frm.doc.discount_amount, frm, true);
            }, 500);
          }
        } else {
          // إذا تم إلغاء الضريبة - إزالة الضرائب وحساب يدوي
          frappe.model.set_value(frm.doc.doctype, frm.doc.name, "taxes", []);
          frappe.model.set_value(frm.doc.doctype, frm.doc.name, "tax_amount", 0);
          frappe.model.set_value(frm.doc.doctype, frm.doc.name, "total_taxes_and_charges", 0);
          
          // حساب الإجمالي بدون ضريبة
          const net_total = frm.doc.net_total || 0;
          const discount_amount = frm.doc.discount_amount || 0;
          const grand_total = net_total - discount_amount;
          
          frappe.model.set_value(frm.doc.doctype, frm.doc.name, "grand_total", Math.max(grand_total, 0));
          
          console.log("Tax disabled - Net:", net_total, "Discount:", discount_amount, "Grand Total:", grand_total);
        }
        
        // تحديث الواجهة
        setTimeout(() => {
          me.update_totals_section(frm);
        }, 300);
      });

      // زر Fixed Amount Discount
      this.$component.on("click.saturn_fixed_discount", ".add-fixed-discount-wrapper", function () {
        const can_edit_discount = me.$totals_section.find(".edit-fixed-discount-btn").length;

        if (!me.fixed_discount_field || can_edit_discount) me.show_fixed_discount_control();
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
          } catch (err) {
            console.warn("saturn: failed to clear taxes locally", err);
          }
        }
      });

      // ثم نادِيّ النسخة الأصلية حتى تبقى باقي الوظائف كما هي
      orig_bind_events.apply(this, arguments);
    };

    // === 3) دالة جديدة لعرض حقل الخصم بالمبلغ ===
    ItemCart.prototype.show_fixed_discount_control = function () {
      this.$totals_section.find(".add-fixed-discount-wrapper").css({ padding: "0px", border: "none" });
      this.$totals_section.find(".add-fixed-discount-wrapper").html(`<div class="add-fixed-discount-field"></div>`);
      const me = this;
      const frm = me.events.get_frm();
      let discount = frm.doc.discount_amount;

      this.fixed_discount_field = frappe.ui.form.make_control({
        df: {
          label: __("Fixed Discount"),
          fieldtype: "Currency",
          placeholder: discount ? format_currency(discount, frm.doc.currency) : __("Enter discount amount."),
          input_class: "input-xs",
          onchange: function () {
            const discount_amount = flt(this.value);
            me.apply_fixed_discount(discount_amount, frm, false);
            me.hide_fixed_discount_control(discount_amount);
          },
        },
        parent: this.$totals_section.find(".add-fixed-discount-wrapper").find(".add-fixed-discount-field"),
        render_input: true,
      });
      this.fixed_discount_field.toggle_label(false);
      this.fixed_discount_field.set_focus();
    };

    // === 4) دالة جديدة لتطبيق الخصم بالمبلغ بالمنطق الصحيح ===
    ItemCart.prototype.apply_fixed_discount = function (discount_amount, frm, fromTaxChange) {
      if (!frm || !frm.doc) return;
      
      console.log("=== APPLYING FIXED DISCOUNT ===");
      console.log("Discount amount:", discount_amount);
      console.log("Net total before:", frm.doc.net_total);
      console.log("Grand total before:", frm.doc.grand_total);
      console.log("Apply taxes:", this.apply_taxes);
      console.log("From tax change:", fromTaxChange);
      
      // حفظ مبلغ الخصم
      this.fixed_discount_amount = discount_amount;
      
      // تعيين قيمة الخصم في المستند
      frappe.model.set_value(frm.doc.doctype, frm.doc.name, "discount_amount", discount_amount);
      
      // إلغاء الخصم النسبي
      frappe.model.set_value(frm.doc.doctype, frm.doc.name, "additional_discount_percentage", 0);
      
      if (this.apply_taxes) {
        // الحالة 1: الضريبة مفعلة - دع النظام يحسب بشكل طبيعي
        console.log("Case 1: Tax enabled - letting system calculate normally");
        frm.trigger("calculate_taxes_and_totals");
      } else {
        // الحالة 2: الضريبة غير مفعلة - حساب يدوي بدون ضريبة
        console.log("Case 2: Tax disabled - manual calculation without tax");
        
        // الحصول على net total الحقيقي (مجموع items)
        let actual_net_total = 0;
        if (frm.doc.items && frm.doc.items.length > 0) {
          actual_net_total = frm.doc.items.reduce((sum, item) => sum + (item.amount || 0), 0);
        } else {
          actual_net_total = frm.doc.net_total || 0;
        }
        
        console.log("Actual net total from items:", actual_net_total);
        
        // حساب الإجمالي النهائي بدون ضريبة
        const grand_total_without_tax = actual_net_total - discount_amount;
        
        // التأكد من أن الإجمالي لا يقل عن الصفر
        const final_grand_total = Math.max(grand_total_without_tax, 0);
        
        console.log("Manual calculation: Net", actual_net_total, "- Discount", discount_amount, "= Grand Total", final_grand_total);
        
        // تحديث net_total أولاً
        frappe.model.set_value(frm.doc.doctype, frm.doc.name, "net_total", actual_net_total);
        
        // ثم تحديث grand_total
        frappe.model.set_value(frm.doc.doctype, frm.doc.name, "grand_total", final_grand_total);
        
        // إذا كان النظام يستخدم rounded_total
        if (frm.doc.rounded_total !== undefined) {
          const rounded_total = cint(frappe.sys_defaults.disable_rounded_total) ? final_grand_total : Math.round(final_grand_total);
          frappe.model.set_value(frm.doc.doctype, frm.doc.name, "rounded_total", rounded_total);
        }
        
        // إزالة الضرائب من الوثيقة
        frappe.model.set_value(frm.doc.doctype, frm.doc.name, "taxes", []);
        frappe.model.set_value(frm.doc.doctype, frm.doc.name, "tax_amount", 0);
        frappe.model.set_value(frm.doc.doctype, frm.doc.name, "total_taxes_and_charges", 0);
      }
      
      // تحديث الواجهة
      setTimeout(() => {
        this.update_totals_section(frm);
      }, 500);
      
      if (!fromTaxChange) {
        frappe.show_alert({
          message: __("Fixed discount of {0} applied", [format_currency(discount_amount, frm.doc.currency)]),
          indicator: "green"
        });
      }
      
      console.log("=== DISCOUNT APPLICATION COMPLETE ===");
    };

    // === 5) دالة جديدة لإخفاء حقل الخصم بالمبلغ ===
    ItemCart.prototype.hide_fixed_discount_control = function (discount) {
      if (!flt(discount)) {
        this.$totals_section.find(".add-fixed-discount-wrapper").css({
          border: "1px dashed var(--gray-500)",
          padding: "var(--padding-sm) var(--padding-md)",
        });
        this.$totals_section.find(".add-fixed-discount-wrapper").html(`${this.get_discount_icon()} ${__("Fixed Amount Discount")}`);
        this.fixed_discount_field = undefined;
      } else {
        this.$totals_section.find(".add-fixed-discount-wrapper").css({
          border: "1px dashed var(--dark-green-500)",
          padding: "var(--padding-sm) var(--padding-md)",
        });
        this.$totals_section.find(".add-fixed-discount-wrapper").html(
          `<div class="edit-fixed-discount-btn">
            ${this.get_discount_icon()} ${__("Fixed discount of")} ${format_currency(discount, this.events.get_frm().doc.currency)} ${__("applied")}
          </div>`
        );
      }
    };

    // === 6) Override update_totals_section: تحديث الواجهة مع المنطق الصحيح ===
    ItemCart.prototype.update_totals_section = function (frm) {
      // call original to compute and render
      orig_update_totals_section.apply(this, arguments);

      // sync UI with apply_taxes flag
      const apply_taxes = (typeof this.apply_taxes === "undefined") ? true : this.apply_taxes;

      // إذا كانت الضريبة غير مفعلة، نقوم بعرض الحسابات بدون ضريبة
      if (!apply_taxes) {
        const currency = this.events.get_frm().doc.currency;
        
        // حساب net total من العناصر مباشرة لتجنب الأخطاء
        let net_total = 0;
        if (frm && frm.doc && frm.doc.items) {
          net_total = frm.doc.items.reduce((sum, item) => sum + (item.amount || 0), 0);
        } else {
          net_total = (frm && frm.doc) ? frm.doc.net_total || 0 : 0;
        }
        
        const discount_amount = (frm && frm.doc) ? frm.doc.discount_amount || 0 : 0;
        
        // حساب الإجمالي بدون ضريبة: الصافي - الخصم
        let grand_total_without_tax = net_total - discount_amount;
        grand_total_without_tax = Math.max(grand_total_without_tax, 0);
        
        console.log("Display update - Net:", net_total, "Discount:", discount_amount, "Grand Total:", grand_total_without_tax);
        
        // تحديث net total display
        this.$totals_section.find(".net-total-container").html(`<div>${__("Net Total")}</div><div>${format_currency(net_total, currency)}</div>`);
        this.$numpad_section.find(".numpad-net-total").html(`<div>${__("Net Total")}: <span>${format_currency(net_total, currency)}</span></div>`);
        
        // تحديث grand total display
        this.$totals_section.find(".grand-total-container").html(`<div>${__("Grand Total")}</div><div>${format_currency(grand_total_without_tax, currency)}</div>`);
        this.$numpad_section.find(".numpad-grand-total").html(`<div>${__("Grand Total")}: <span>${format_currency(grand_total_without_tax, currency)}</span></div>`);
        
        // إخفاء الضرائب
        this.$totals_section.find(".taxes-container").css("display", "none").html("");
      } else {
        // إذا كانت الضريبة مفعلة، تأكد من عرض الضرائب
        this.$totals_section.find(".taxes-container").css("display", "flex");
      }

      // sync checkbox UI
      const $chk = this.$totals_section.find(".toggle-tax");
      if ($chk.length) $chk.prop("checked", apply_taxes);

      // عرض الخصم بالمبلغ إذا كان مطبقاً
      if (frm && frm.doc && frm.doc.discount_amount > 0) {
        const currency = this.events.get_frm().doc.currency;
        const $discountRows = this.$totals_section.find('.totals-item');
        
        // البحث عن صف الخصم أو إنشاؤه إذا لم يكن موجوداً
        let $discountRow = $discountRows.filter(function() {
          return $(this).text().includes("Discount");
        });
        
        if (!$discountRow.length) {
          // إنشاء صف الخصم إذا لم يكن موجوداً
          $discountRow = $(`
            <div class="totals-item discount-row">
              <div>${__("Fixed Discount")}</div>
              <div class="text-right">${format_currency(-frm.doc.discount_amount, currency)}</div>
            </div>
          `);
          this.$totals_section.find(".net-total-container").after($discountRow);
        } else {
          // تحديث قيمة الخصم إذا كان الصف موجوداً
          $discountRow.find('.text-right').text(format_currency(-frm.doc.discount_amount, currency));
          // تحديث التسمية لتكون Fixed Discount بدلاً من Discount العادي
          $discountRow.find('div:first-child').text(__("Fixed Discount"));
        }
      } else {
        // إزالة صف الخصم إذا لم يكن هناك خصم
        this.$totals_section.find('.discount-row').remove();
      }
    };

    // === 7) Override لحفظ إعدادات الضريبة عند تحميل الفاتورة ===
    const orig_load_invoice = ItemCart.prototype.load_invoice;
    ItemCart.prototype.load_invoice = function () {
      orig_load_invoice.apply(this, arguments);
      
      // تطبيق إعدادات الضريبة الحالية عند تحميل الفاتورة
      const frm = this.events.get_frm();
      if (frm && frm.doc) {
        // تعيين apply_taxes في المستند
        frappe.model.set_value(frm.doc.doctype, frm.doc.name, "apply_taxes", this.apply_taxes ? 1 : 0);
        
        setTimeout(() => {
          this.update_totals_section(frm);
        }, 500);
      }
    };

    console.log("saturn: POS ItemCart override loaded with Fixed Amount Discount - TAX REAPPLY FIX");
  }

  init();
})();
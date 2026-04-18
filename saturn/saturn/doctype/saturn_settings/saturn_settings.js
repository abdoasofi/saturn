// Copyright (c) 2026, Asofi and contributors
// For license information, please see license.txt

frappe.ui.form.on('Saturn Settings', {
    update_reorder_btn: function(frm) {
        frappe.confirm(__('هل أنت متأكد من رغبتك في تحديث مستويات إعادة الطلب وإصدار طلبات المواد الآن؟'), function() {
            // إظهار رسالة تحميل للمستخدم
            frm.dashboard.set_headline(__("جاري تحليل البيانات وتحديث المخزون... يرجى الانتظار."));
            
            frappe.call({
                method: "saturn.utils.inventory_engine.execute_daily_reorder_update",
                callback: function(r) {
                    if(!r.exc) {
                        frappe.msgprint(__("تم تحديث المستويات وإنشاء طلبات المواد بنجاح!"));
                        frm.dashboard.clear_headline();
                    }
                }
            });
        });
    }
});

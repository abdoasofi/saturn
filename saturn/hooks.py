app_name = "saturn"
app_title = "saturn"
app_publisher = "Asofi"
app_description = "Frappe app saturn"
app_email = "abdoalsofi576@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "saturn",
# 		"logo": "/assets/saturn/logo.png",
# 		"title": "saturn",
# 		"route": "/saturn",
# 		"has_permission": "saturn.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/saturn/css/saturn.css"
# app_include_js = "/assets/saturn/js/saturn.js"

# include js, css files in header of web template
# web_include_css = "/assets/saturn/css/saturn.css"
# web_include_js = "/assets/saturn/js/saturn.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "saturn/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
    "Customer" : "public/js/customer.js",
    "Sales Order" : "public/js/sales_order.js",
    "Material Request" : "public/js/material_request.js",
    "Stock Entry" : "public/js/stock_entry.js",
    }
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "saturn/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "saturn.utils.jinja_methods",
# 	"filters": "saturn.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "saturn.install.before_install"
# after_install = "saturn.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "saturn.uninstall.before_uninstall"
# after_uninstall = "saturn.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "saturn.utils.before_app_install"
# after_app_install = "saturn.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "saturn.utils.before_app_uninstall"
# after_app_uninstall = "saturn.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "saturn.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
    "Sales Order": {
        "validate": "saturn.loyalty_program_extension.so_before_validate",
        "on_submit": "saturn.loyalty_program_extension.so_on_submit",
        "on_cancel": "saturn.loyalty_program_extension.so_on_cancel"
    },
    "Material Request": {
        "on_submit": "saturn.api.create_se_from_material_request",
    }
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"saturn.tasks.all"
# 	],
# 	"daily": [
# 		"saturn.tasks.daily"
# 	],
# 	"hourly": [
# 		"saturn.tasks.hourly"
# 	],
# 	"weekly": [
# 		"saturn.tasks.weekly"
# 	],
# 	"monthly": [
# 		"saturn.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "saturn.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "saturn.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "saturn.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["saturn.utils.before_request"]
# after_request = ["saturn.utils.after_request"]

# Job Events
# ----------
# before_job = ["saturn.utils.before_job"]
# after_job = ["saturn.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"saturn.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

fixtures = [
    {
        "doctype": "Print Format",
        "filters": [
            ["name", "in", ["Custom Material Request Layout"]]
        ]
    },
    {
        "doctype": "Property Setter",
        "filters": [
            ["name", "in", [
                # Sales Order
                "Sales Order-main-field_order",
                "Sales Order-main-links_order",
                
                "Sales Order-loyalty_points_redemption-hidden",
                "Sales Order-loyalty_points-read_only",
                "Sales Order-loyalty_points-no_copy",
                "Sales Order-loyalty_points-hidden",
                "Sales Order-loyalty_points-depends_on",
                "Sales Order-loyalty_points-mandatory_depends_on",
                
                "Sales Order-loyalty_amount-hidden",
                "Sales Order-loyalty_amount-no_copy",
                "Sales Order-loyalty_amount-depends_on",
                "Sales Order-loyalty_amount-mandatory_depends_on",
                # Customer
                "Customer-main-default_print_format",
                "Customer-main-field_order",
                # Loyalty Program
                "Loyalty Program-main-links_order",
            ]]
        ]
    },
    {
        "doctype": "Custom Field",
        "filters": [
            ["dt", "=", "User"]
        ]
    }
    
    ]
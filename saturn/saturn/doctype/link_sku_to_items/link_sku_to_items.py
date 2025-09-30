# Copyright (c) 2025, Asofi and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

class LinkSKUToItems(Document):
	# This is a standard server-side hook that runs before saving
	def validate(self):
		# Calculate the sum of quantities in the child table
		total_in_table = sum(row.sku_quantity for row in self.sku_quantity_the_item)

		# Check if the sum exceeds the total allowed quantity
		if self.total_sku_quantity > 0 and total_in_table > self.total_sku_quantity:
			frappe.throw(
				_("Total quantity in the table ({0}) cannot exceed the Total SKU Quantity ({1}).").format(
					total_in_table, self.total_sku_quantity
				),
				title=_("Validation Error")
			)
				
	@frappe.whitelist()
	def get_items_by_sku(self):
		"""
		Fetches all items that have a matching SKU.
		Returns a list of dictionaries with item_code and quantity_sku.
		"""
		sku = self.sku
		if not sku:
			return []

		items = frappe.get_all("Item",
			filters={"sku": sku},
			fields=["name", "quantity_sku"]
		)
		# Format the data for the child table
		# The 'name' field is the item_code
		formatted_items = []
		for item in items:
			formatted_items.append({
				"item": item.name,
				"sku_quantity": item.quantity_sku or 0
			})
			
		return formatted_items

	@frappe.whitelist()
	def update_sku_in_items(self):
		"""
		Updates the SKU field for all items listed in the child table.
		"""
		doc_name = self.name
		new_sku = self.sku
		if not doc_name or not new_sku:
			frappe.throw("Document Name and New SKU are required.")

		doc = frappe.get_doc("Link SKU To Items", doc_name)
		
		updated_items = []
		for row in doc.sku_quantity_the_item:
			try:
				frappe.db.set_value("Item", row.item, "sku", new_sku)
				updated_items.append(row.item)
			except Exception as e:
				frappe.log_error(frappe.get_traceback(), f"Failed to update SKU for Item {row.item}")

		frappe.db.commit()
		frappe.msgprint(f"Successfully updated SKU for {len(updated_items)} items.")
		return updated_items

	@frappe.whitelist()
	def update_quantities_in_items(self):
		"""
		Updates the quantity_sku field for all items based on the values in the child table.
		"""
		doc_name = self.name
		if not doc_name:
			frappe.throw("Document Name is required.")
			
		doc = frappe.get_doc("Link SKU To Items", doc_name)

		updated_items = []
		for row in doc.sku_quantity_the_item:
			try:
				frappe.db.set_value("Item", row.item, "quantity_sku", row.sku_quantity)
				updated_items.append(row.item)
			except Exception as e:
				frappe.log_error(frappe.get_traceback(), f"Failed to update SKU Quantity for Item {row.item}")
		
		frappe.db.commit()
		frappe.msgprint(f"Successfully updated SKU Quantity for {len(updated_items)} items.")
		return updated_items

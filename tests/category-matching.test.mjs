import assert from "node:assert/strict";
import test from "node:test";

import { productMatchesCategory } from "../lib/category-config.ts";

const config = {
  menuLimit: 7,
  categories: [
    {
      id: "shoes",
      name: "신발",
      visible: true,
      children: [
        { id: "boots", name: "부츠", visible: true, children: [] },
        { id: "boots-walker", name: "부츠/워커", visible: true, children: [] },
      ],
    },
  ],
};

test("similarly named sibling categories only match exact product assignments", () => {
  const movedProduct = { category: "신발", subcategory: "부츠/워커" };
  assert.equal(productMatchesCategory(movedProduct, "부츠", config), false);
  assert.equal(productMatchesCategory(movedProduct, "부츠/워커", config), true);
  assert.equal(productMatchesCategory(movedProduct, "신발", config), true);
});

test("parent categories include products assigned to their configured descendants", () => {
  const nestedConfig = {
    menuLimit: 7,
    categories: [{
      id: "shoes",
      name: "신발",
      visible: true,
      children: [{
        id: "outdoor",
        name: "아웃도어",
        visible: true,
        children: [{ id: "trail", name: "트레일화", visible: true }],
      }],
    }],
  };
  const product = { category: "신발", subcategory: "트레일화" };
  assert.equal(productMatchesCategory(product, "아웃도어", nestedConfig), true);
  assert.equal(productMatchesCategory(product, "신발", nestedConfig), true);
});

import { Package } from "lucide-react";

import ActionForm from "@/components/staff/action-form";
import styles from "@/components/account/account.module.css";
import { money } from "@/lib/commerce";
import { kushApi } from "@/lib/server/kush-api";
import { has, requireStaff } from "@/lib/server/staff";

interface StaffProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string | null;
  imageUrl: string | null;
  pricePence: number | null;
  visibility: "public" | "unlisted" | "hidden";
  status: "draft" | "active" | "retired";
  rewardEligible: boolean;
  inStripe: boolean;
}

function ProductFields({ product }: { product?: StaffProduct }) {
  return (
    <>
      {product ? null : (
        <input
          name="slug"
          className={styles.input}
          required
          pattern="[a-z0-9][a-z0-9-]{0,59}"
          placeholder="Code, e.g. rust-starter-pack"
          aria-label="Product code"
        />
      )}
      <input name="name" className={styles.input} required minLength={2} maxLength={120} defaultValue={product?.name} placeholder="Name" aria-label="Name" />
      <textarea name="description" className={styles.input} rows={3} maxLength={2000} defaultValue={product?.description} placeholder="What it is and what's included" aria-label="Description" />
      <div className={styles.formRow}>
        <input
          name="price"
          className={styles.input}
          required
          defaultValue={product?.pricePence ? (product.pricePence / 100).toString() : ""}
          placeholder="Price in £"
          aria-label="Price in pounds"
        />
        <input name="category" className={styles.input} maxLength={60} defaultValue={product?.category ?? ""} placeholder="Category (optional)" aria-label="Category" />
      </div>
      <input name="imageUrl" className={styles.input} type="url" pattern="https://.*" maxLength={500} defaultValue={product?.imageUrl ?? ""} placeholder="Image URL (https, optional)" aria-label="Image URL" />
      <div className={styles.formRow}>
        <select name="status" className={styles.input} defaultValue={product?.status ?? "draft"} aria-label="Status">
          <option value="draft">Draft (not for sale)</option>
          <option value="active">For sale</option>
          <option value="retired">Archived (owners keep it)</option>
        </select>
        <select name="visibility" className={styles.input} defaultValue={product?.visibility ?? "public"} aria-label="Visibility">
          <option value="public">Listed publicly</option>
          <option value="unlisted">Unlisted (link only)</option>
          <option value="hidden">Hidden</option>
        </select>
      </div>
      <label className={styles.rowMeta}>
        <input type="checkbox" name="rewardEligible" value="yes" defaultChecked={product?.rewardEligible} /> Can be given as a
        referral reward
      </label>
    </>
  );
}

export default async function StaffProducts() {
  const gate = await requireStaff();
  if (!gate) return null;
  if (!has(gate.me, "products.manage")) return <p className={styles.lede}>Products are managed by administrators.</p>;
  const { products, payments } = await kushApi<{ products: StaffProduct[]; payments: "off" | "test" | "live" }>(
    "/web/staff/products",
    { token: gate.token },
  );

  return (
    <>
      <p className={styles.kicker}>PRODUCTS</p>
      <h1 className={styles.title}>
        What we <em>sell.</em>
      </h1>
      <p className={styles.lede}>
        Ready-made products customers can buy. Saving syncs the product and price to Stripe. Card payments are{" "}
        <strong>{payments === "off" ? "not connected yet" : payments === "test" ? "in Stripe test mode" : "live"}</strong>.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Products</h2>
        {products.length === 0 ? (
          <div className={styles.empty}>
            <Package size={28} aria-hidden="true" style={{ color: "var(--green)" }} />
            <p className={styles.emptyTitle}>No products yet</p>
          </div>
        ) : (
          products.map((product) => (
            <details key={product.id} className={styles.card} style={{ marginBottom: 12 }}>
              <summary className={styles.headerRow} style={{ cursor: "pointer", listStyle: "none" }}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>{product.name}</p>
                  <p className={styles.rowMeta}>
                    {product.slug} · {product.pricePence ? money(product.pricePence) : "no price"} · {product.visibility}
                    {product.inStripe ? " · in Stripe" : ""}
                  </p>
                </div>
                <span className={`${styles.badge} ${product.status === "active" ? styles.badgeOn : ""}`}>
                  {product.status === "active" ? "FOR SALE" : product.status.toUpperCase()}
                </span>
              </summary>
              <div style={{ marginTop: 16 }}>
                <ActionForm action="saveProduct" hidden={{ productId: product.id }} submit="SAVE">
                  <ProductFields product={product} />
                </ActionForm>
              </div>
            </details>
          ))
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Add a product</h2>
        <div className={styles.card} key={products.length}>
          <ActionForm action="saveProduct" hidden={{ productId: "" }} submit="CREATE PRODUCT">
            <ProductFields />
          </ActionForm>
        </div>
      </section>
    </>
  );
}

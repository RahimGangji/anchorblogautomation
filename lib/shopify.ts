import type { ShopifyConnectionDocument } from "@/lib/types";

const SHOPIFY_API_VERSION = "2026-01";

type ShopifyGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

function graphqlUrl(shopDomain: string) {
  return `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
}

async function shopifyGraphql<T>(
  connection: Pick<ShopifyConnectionDocument, "shopDomain" | "accessToken">,
  query: string,
  variables: Record<string, unknown>,
) {
  const response = await fetch(graphqlUrl(connection.shopDomain), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": connection.accessToken,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as ShopifyGraphqlResponse<T> | null;

  if (!response.ok) {
    throw new Error(`Shopify returned HTTP ${response.status}. Check the store domain and access token.`);
  }

  if (body?.errors?.length) {
    throw new Error(body.errors[0]?.message ?? "Shopify rejected the request.");
  }

  if (!body?.data) {
    throw new Error("Shopify did not return data.");
  }

  return body.data;
}

export async function validateShopifyConnection(params: {
  shopDomain: string;
  accessToken: string;
  blogId: string;
}) {
  const data = await shopifyGraphql<{
    shop: { name: string; myshopifyDomain: string };
    blog: null | { id: string; title: string; handle: string };
  }>(
    params,
    `query ValidateShopifyConnection($blogId: ID!) {
      shop {
        name
        myshopifyDomain
      }
      blog(id: $blogId) {
        id
        title
        handle
      }
    }`,
    { blogId: params.blogId },
  );

  if (!data.blog) {
    throw new Error("Shopify connected, but that Blog ID was not found.");
  }

  return {
    shopDomain: data.shop.myshopifyDomain || params.shopDomain,
    blogId: data.blog.id,
    blogTitle: data.blog.title,
  };
}

export async function createShopifyDraft(
  connection: ShopifyConnectionDocument,
  title: string,
  contentHtml: string,
  summary: string,
  featuredImage?: { dataUrl: string; fileName: string; mimeType: string } | null,
) {
  const data = await shopifyGraphql<{
    articleCreate: {
      article: null | {
        id: string;
        handle: string;
        blog: { handle: string };
      };
      userErrors: Array<{ message: string }>;
    };
  }>(
    connection,
    `mutation CreateArticle($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article {
          id
          handle
          blog {
            handle
          }
        }
        userErrors {
          message
        }
      }
    }`,
    {
      article: {
        blogId: connection.blogId,
        title,
        author: { name: connection.authorName },
        body: contentHtml,
        summary,
        ...(featuredImage
          ? {
              image: {
                altText: title,
                attachment: dataUrlToBase64(featuredImage.dataUrl),
              },
            }
          : {}),
        isPublished: false,
      },
    },
  );

  const error = data.articleCreate.userErrors[0];
  if (error) {
    throw new Error(error.message);
  }

  const article = data.articleCreate.article;
  if (!article) {
    throw new Error("Shopify did not return the created article.");
  }

  return {
    id: article.id,
    link: `https://${connection.shopDomain}/blogs/${article.blog.handle}/${article.handle}`,
  };
}

function dataUrlToBase64(dataUrl: string) {
  const [, base64] = dataUrl.split(",");
  if (!base64) throw new Error("Featured image data is invalid.");
  return base64;
}

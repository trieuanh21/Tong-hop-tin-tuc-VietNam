#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import Parser from "rss-parser";

// Danh sách nguồn RSS các báo Việt Nam
const RSS_SOURCES = {
  vnexpress: {
    name: "VnExpress",
    feeds: {
      home: "https://vnexpress.net/rss/tin-moi-nhat.rss",
      news: "https://vnexpress.net/rss/thoi-su.rss",
      world: "https://vnexpress.net/rss/the-gioi.rss",
      business: "https://vnexpress.net/rss/kinh-doanh.rss",
      tech: "https://vnexpress.net/rss/so-hoa.rss",
      sports: "https://vnexpress.net/rss/the-thao.rss",
    },
  },
  tuoitre: {
    name: "Tuổi Trẻ",
    feeds: {
      home: "https://tuoitre.vn/rss/tin-moi-nhat.rss",
      news: "https://tuoitre.vn/rss/thoi-su.rss",
      world: "https://tuoitre.vn/rss/the-gioi.rss",
      business: "https://tuoitre.vn/rss/kinh-doanh.rss",
      tech: "https://tuoitre.vn/rss/nhip-song-so.rss",
    },
  },
  thanhnien: {
    name: "Thanh Niên",
    feeds: {
      home: "https://thanhnien.vn/rss/home.rss",
      news: "https://thanhnien.vn/rss/thoi-su.rss",
      world: "https://thanhnien.vn/rss/the-gioi.rss",
      business: "https://thanhnien.vn/rss/tai-chinh-kinh-doanh.rss",
      tech: "https://thanhnien.vn/rss/cong-nghe.rss",
    },
  },
  dantri: {
    name: "Dân Trí",
    feeds: {
      home: "https://dantri.com.vn/rss/trang-chinh.rss",
      news: "https://dantri.com.vn/rss/xa-hoi.rss",
      world: "https://dantri.com.vn/rss/the-gioi.rss",
      business: "https://dantri.com.vn/rss/kinh-doanh.rss",
      tech: "https://dantri.com.vn/rss/suc-manh-so.rss",
    },
  },
  zingnews: {
    name: "Zing News",
    feeds: {
      home: "https://zingnews.vn/rss",
      news: "https://zingnews.vn/tin-tuc.rss",
      tech: "https://zingnews.vn/cong-nghe.rss",
      business: "https://zingnews.vn/kinh-doanh-tai-chinh.rss",
    },
  },
};

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; MCP-RSS-Bot/1.0)",
  },
});

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: string;
  description?: string;
}

async function fetchRSSFeed(url: string, source: string, category: string): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.slice(0, 10).map((item) => ({
      title: item.title || "No title",
      link: item.link || "",
      pubDate: item.pubDate || new Date().toISOString(),
      source: source,
      category: category,
      description: item.contentSnippet || item.content || "",
    }));
  } catch (error) {
    console.error(`Error fetching ${source} ${category}:`, error);
    return [];
  }
}

async function aggregateNews(sources: string[], categories: string[], limit: number = 20): Promise<NewsItem[]> {
  const allPromises: Promise<NewsItem[]>[] = [];

  for (const sourceKey of sources) {
    const source = RSS_SOURCES[sourceKey as keyof typeof RSS_SOURCES];
    if (!source) continue;

    for (const categoryKey of categories) {
      const feedUrl = source.feeds[categoryKey as keyof typeof source.feeds];
      if (feedUrl) {
        allPromises.push(fetchRSSFeed(feedUrl, source.name, categoryKey));
      }
    }
  }

  const results = await Promise.all(allPromises);
  const allNews = results.flat();

  // Sắp xếp theo thời gian mới nhất
  allNews.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  return allNews.slice(0, limit);
}

// Tạo server với config đầy đủ
const server = new Server(
  {
    name: "vietnamese-news-rss",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handler cho list tools - QUAN TRỌNG
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("ListTools called");
  return {
    tools: [
      {
        name: "get_vietnamese_news",
        description: "Lấy tin tức mới nhất từ các báo Việt Nam qua RSS. Hỗ trợ VnExpress, Tuổi Trẻ, Thanh Niên, Dân Trí, Zing News",
        inputSchema: {
          type: "object",
          properties: {
            sources: {
              type: "array",
              description: "Danh sách nguồn tin",
              items: {
                type: "string",
                enum: ["vnexpress", "tuoitre", "thanhnien", "dantri", "zingnews"],
              },
              default: ["vnexpress", "tuoitre", "thanhnien", "dantri", "zingnews"],
            },
            categories: {
              type: "array",
              description: "Danh mục tin",
              items: {
                type: "string",
                enum: ["home", "news", "world", "business", "tech", "sports"],
              },
              default: ["home"],
            },
            limit: {
              type: "number",
              description: "Số lượng tin tối đa",
              minimum: 1,
              maximum: 100,
              default: 20,
            },
          },
        },
      },
      {
        name: "list_news_sources",
        description: "Liệt kê tất cả nguồn tin và danh mục có sẵn",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handler cho call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error(`CallTool: ${request.params.name}`);
  
  const { name, arguments: args } = request.params;

  try {
    if (name === "list_news_sources") {
      const sourceList = Object.entries(RSS_SOURCES).map(([key, value]) => ({
        id: key,
        name: value.name,
        categories: Object.keys(value.feeds),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(sourceList, null, 2),
          },
        ],
      };
    }

    if (name === "get_vietnamese_news") {
      const sources = (args?.sources as string[]) || Object.keys(RSS_SOURCES);
      const categories = (args?.categories as string[]) || ["home"];
      const limit = Math.min(Math.max((args?.limit as number) || 20, 1), 100);

      const news = await aggregateNews(sources, categories, limit);

      if (news.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "⚠️ Không lấy được tin tức. Vui lòng thử lại sau.",
            },
          ],
        };
      }

      const formattedNews = news.map((item, index) => 
        `${index + 1}. **${item.title}**\n` +
        `   📰 ${item.source} | 📂 ${item.category}\n` +
        `   🕐 ${new Date(item.pubDate).toLocaleString('vi-VN')}\n` +
        `   🔗 ${item.link}\n` +
        (item.description ? `   📝 ${item.description.substring(0, 150)}...\n` : '') +
        `\n`
      ).join('---\n\n');

      return {
        content: [
          {
            type: "text",
            text: `# 📰 Tin tức Việt Nam (${news.length} tin)\n\n${formattedNews}`,
          },
        ],
      };
    }

    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${name}`
    );
  } catch (error) {
    console.error("Error in tool execution:", error);
    throw error;
  }
});

// Main function
async function main() {
  console.error("Starting Vietnamese News RSS MCP Server...");
  
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  
  console.error("✅ Vietnamese News RSS MCP Server running on stdio");
  console.error("Available tools: get_vietnamese_news, list_news_sources");
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

# INTERDEE Appwrite 免费后台迁移

## 1. 创建免费项目

在 Appwrite Cloud 创建 Free 项目，并在 **Add a platform → Web** 中加入：

- `interdeeparis-bot.github.io`
- 如需本机测试，再加入 `localhost`

把项目 ID 填入 `appwrite-config.js` 的 `projectId`。不要填写 API Key。

## 2. 建立数据库

建立数据库 ID `interdee`，再建立以下 **表（Tables）**：

| 表 ID | 必需列 | 权限 |
| --- | --- | --- |
| `products` | `payload`：Text（16,383 字符足够） | 读：Any；创建/修改/删除：Users |
| `settings` | `payload`：Text（16,383 字符足够） | 读：Any；创建/修改/删除：Users |
| `orders` | `payload`：Text（16,383 字符足够） | 创建：Any；读/修改/删除：Users |

`payload` 存储整条 JSON 数据，因此不需要为颜色、尺码、库存再建立几十个列。当前网站已经切换到新版 TablesDB 接口。

## 3. 建立图片存储桶

建立存储桶 ID `product-media`：

- 读：Any
- 创建/修改/删除：Users
- 单文件大小建议设为 50MB

现有 944 张、约 222MB 的商品图片继续从 GitHub Pages 读取，不需要重复上传。后台以后新增的图片会上传到此存储桶。

## 4. 建立管理员

在 Appwrite **Auth → Users** 创建一个管理员邮箱和至少 8 位密码。只有这个账号能编辑库存、页面设置和订单；客人无需账号即可提交预订单。

## 5. 导入数据

打开 `appwrite-migrate.html`，使用管理员账号登录，点击“导入商品和页面设置”。旧订单按要求不迁移。

迁移完成后，打开 `admin-online.html` 管理库存和订单，客人继续使用 `index.html`。

## 免费额度说明

Appwrite Free 方案目前包含 2GB 存储、5GB/月 API 带宽、每月 50 万次读取和 25 万次写入。达到免费额度后会暂停相应服务，不会自动购买额外资源；因此应定期在 Appwrite Usage 页面查看用量。


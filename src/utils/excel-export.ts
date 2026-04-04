import * as XLSX from 'xlsx'
import { Post } from '@/db/schema'

/**
 * Exports an array of posts to an Excel file.
 * @param posts The list of posts to export.
 */
export function exportPostsToExcel(posts: Post[]) {
    // Map the post data to a format suitable for Excel columns
    const data = posts.map(post => ({
        'ID Bài Viết': post.fbPostId,
        'Tác Giả': post.authorName,
        'Đường Dẫn Tác Giả': post.authorUrl,
        'Nội Dung': post.content,
        'Lượt Thích': post.likes || 0,
        'Lượt Chia Sẻ': post.shares || 0,
        'Lượt Bình Luận': post.comments || 0,
        'Ảnh': post.images?.length > 0 ? post.images.join('\n') : '',
        'Video': post.videos?.length > 0 ? post.videos.join('\n') : '',
        'Từ Khóa': post.keywordUsed,
        'Ngày Đăng': post.timestamp ? new Date(post.timestamp).toLocaleString() : '',
        'Ngày Quét': post.crawledAt ? new Date(post.crawledAt).toLocaleString() : '',
        'Đường Dẫn Bài Viết': post.postUrl
    }))

    // Create a new worksheet from the JSON data
    const worksheet = XLSX.utils.json_to_sheet(data)

    // Create a new workbook and append the worksheet
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Posts')

    // Generate a filename with the current timestamp
    const now = new Date()
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`
    const filename = `facebook_export_${timestamp}.xlsx`

    // Write the workbook to a file and trigger the browser download
    XLSX.writeFile(workbook, filename)
}

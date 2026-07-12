import type { SupabaseClient } from '@supabase/supabase-js'
import type { Attachment } from './types'

// Uploads live in the private `task-files` bucket (migration 032); the app
// renders them via short-lived signed URLs that any authenticated member may
// mint client-side.

export const TASK_FILES_BUCKET = 'task-files'
export const TASK_FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip'
export const TASK_FILE_MAX_BYTES = 15 * 1024 * 1024 // 15 MB per file

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
}

/** Upload files for a task and insert one `attachments` row per file.
 *  Returns the created rows; throws with a readable message on failure. */
export async function uploadTaskFiles(
  supabase: SupabaseClient,
  taskId: string,
  files: File[],
  userId: string
): Promise<Attachment[]> {
  const created: Attachment[] = []
  for (const file of files) {
    if (file.size > TASK_FILE_MAX_BYTES) {
      throw new Error(`"${file.name}" is larger than 15 MB.`)
    }
    const path = `${taskId}/${crypto.randomUUID()}-${sanitizeName(file.name)}`
    const { error: upErr } = await supabase.storage.from(TASK_FILES_BUCKET).upload(path, file, { contentType: file.type || undefined })
    if (upErr) throw new Error(`"${file.name}" could not be uploaded: ${upErr.message}`)

    const { data, error: insErr } = await supabase
      .from('attachments')
      .insert({ task_id: taskId, url: null, label: file.name, storage_path: path, file_type: file.type || null, created_by: userId })
      .select('*')
      .single()
    if (insErr || !data) {
      // Don't leave orphaned objects behind if the row insert fails.
      await supabase.storage.from(TASK_FILES_BUCKET).remove([path])
      throw new Error(`"${file.name}" could not be saved: ${insErr?.message || 'unknown error'}`)
    }
    created.push(data as Attachment)
  }
  return created
}

/** Signed URL for an uploaded attachment (1h). Returns null for link attachments. */
export async function signAttachmentUrl(supabase: SupabaseClient, attachment: Attachment): Promise<string | null> {
  if (!attachment.storage_path) return null
  const { data } = await supabase.storage.from(TASK_FILES_BUCKET).createSignedUrl(attachment.storage_path, 60 * 60)
  return data?.signedUrl ?? null
}

/** Delete an attachment row and, for uploads, its storage object. */
export async function deleteAttachment(supabase: SupabaseClient, attachment: Attachment): Promise<void> {
  const { error } = await supabase.from('attachments').delete().eq('id', attachment.id)
  if (error) throw new Error(error.message)
  if (attachment.storage_path) {
    await supabase.storage.from(TASK_FILES_BUCKET).remove([attachment.storage_path])
  }
}

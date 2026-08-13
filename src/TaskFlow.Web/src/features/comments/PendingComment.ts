export interface PendingComment {
  clientId: string
  authorName: string
  text: string
  status: 'pending' | 'failed'
}

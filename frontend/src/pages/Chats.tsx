import { useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import {
  MoreVertical,
  Edit,
  Phone,
  ImagePlus,
  Plus,
  Search as SearchIcon,
  Send,
  Video,
  MessagesSquare,
  Smile,
  X,
  Reply,
  Forward,
  Copy,
  SmilePlus,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type ConversationPayload = {
  id: number
  initiator_id: number
  recipient_id: number
  status: "pending" | "accepted" | "rejected" | "closed"
  created_at: string
  accepted_at: string | null
  last_message_at: string | null
  unread_count?: number
}

type TargetUser = {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  avatar_url?: string | null
}

type LastMessage = {
  id: number
  sender_id: number
  text: string | null
  has_image: boolean
  image_url: string | null
  created_at: string
}

type InboxCard = {
  conversation: ConversationPayload
  target_user: TargetUser
  last_message: LastMessage | null
}

type InboxResponse = {
  ok: boolean
  pending_received: InboxCard[]
  pending_sent: InboxCard[]
  accepted: InboxCard[]
}

type ReactionItem = { emoji: string; count: number }

type ReplyPreview = {
  id: number
  sender_id: number
  text: string | null
  has_image: boolean
  image_url: string | null
  created_at: string
}

type ChatMessage = {
  id: number
  conversation_id: number
  sender_id: number
  text: string | null
  image_url: string | null
  created_at: string

  reply_to?: ReplyPreview | null
  is_forwarded?: boolean
  forwarded_from_id?: number | null

  reactions?: ReactionItem[]
  my_reactions?: string[]
}

type MessagesResponse = {
  ok: boolean
  conversation: ConversationPayload
  messages: ChatMessage[]
}

type MeResponse = {
  ok: boolean
  user?: {
    id: number
    username: string
    email: string
    first_name: string
    last_name: string
    full_name: string
    groups: string[]
  }
  error?: string
}

type SearchUsersResult = {
  user: TargetUser
  is_existing_chat_target: boolean
  conversation: ConversationPayload | null
}

type SearchUsersResponse = {
  ok: boolean
  query: string
  results: SearchUsersResult[]
}

const API_BASE = "/api/chats"
const API_ME = "/api/chats/me"

const EMOJIS = [
  "😀",
  "😁",
  "😂",
  "🤣",
  "😊",
  "😍",
  "😘",
  "😎",
  "🥳",
  "🤩",
  "😅",
  "😭",
  "😡",
  "🤯",
  "😴",
  "🤔",
  "👍",
  "👎",
  "🙏",
  "👏",
  "🔥",
  "💯",
  "🎉",
  "❤️",
  "💔",
  "⭐",
  "⚡",
  "✨",
]

const QUICK_REACTIONS = ["❤️", "😂", "🔥", "👍", "😮", "😡"]

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(data?.error || "Request failed")
  }

  return data
}

async function apiPost<T>(url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(data?.error || "Request failed")
  }

  return data
}

async function apiSendMessage(params: {
  receiver_id: number
  text?: string
  image?: File | null
  reply_to_id?: number | null
  is_forwarded?: boolean
  forwarded_from_id?: number | null
}) {
  const fd = new FormData()
  fd.append("receiver_id", String(params.receiver_id))
  if (params.text) fd.append("text", params.text)
  if (params.image) fd.append("image", params.image)

  if (params.reply_to_id) fd.append("reply_to_id", String(params.reply_to_id))
  if (params.is_forwarded) fd.append("is_forwarded", "true")
  if (params.forwarded_from_id)
    fd.append("forwarded_from_id", String(params.forwarded_from_id))

  const res = await fetch(`${API_BASE}/send/`, {
    method: "POST",
    credentials: "include",
    body: fd,
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(data?.error || "Failed to send message")
  }

  return data
}

async function apiToggleReaction(messageId: number, emoji: string) {
  return apiPost(`${API_BASE}/messages/${messageId}/toggle-reaction/`, { emoji })
}

function getInitials(fullName: string) {
  const clean = String(fullName || "").trim()
  if (!clean) return "?"
  const parts = clean.split(" ").filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function getLastMessagePreview(last_message: LastMessage | null) {
  if (!last_message) return "No messages"
  if (last_message.text) return last_message.text
  if (last_message.has_image) return "📷 Image"
  return ""
}

// ===== Skeleton helpers (added)
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/60 dark:bg-muted/40",
        className
      )}
    />
  )
}

function InboxSkeletonItem() {
  return (
    <div className="w-full rounded-xl p-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-[45%] rounded-md" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <Skeleton className="h-3 w-[80%] rounded-md" />
        </div>
      </div>
    </div>
  )
}

function MessageSkeletonBlock({ mine }: { mine?: boolean }) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className="max-w-[78%] sm:max-w-[72%] space-y-2">
        <Skeleton className={cn("h-10 w-[260px] rounded-2xl")} />
        <Skeleton className={cn("h-3 w-16 rounded-md", mine ? "ml-auto" : "")} />
      </div>
    </div>
  )
}

export default function Chats() {
  const [search, setSearch] = useState("")
  const [selectedCard, setSelectedCard] = useState<InboxCard | null>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false)

  const [me, setMe] = useState<MeResponse | null>(null)
  const myUserId = me?.user?.id ?? null

  const [inbox, setInbox] = useState<InboxResponse | null>(null)
  const [loadingInbox, setLoadingInbox] = useState(true)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)

  const [messageText, setMessageText] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)

  // NEW MESSAGE MODAL STATE
  const [newMessageOpen, setNewMessageOpen] = useState(false)
  const [toSearch, setToSearch] = useState("")
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchUsersResult[]>([])
  const [selectedTarget, setSelectedTarget] = useState<TargetUser | null>(null)

  const searchDebounceRef = useRef<number | null>(null)
  const toInputRef = useRef<HTMLInputElement | null>(null)

  // Image preview modal (zoom)
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  // Selected image thumbnail preview
  const [imagePreviewLocalUrl, setImagePreviewLocalUrl] = useState<string | null>(
    null
  )

  const pollingRef = useRef<number | null>(null)
  const lastMessageIdRef = useRef<number>(0)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const reactionBoxRef = useRef<HTMLDivElement | null>(null)

  // emoji popover (input)
  const [emojiOpen, setEmojiOpen] = useState(false)

  // Context menu (Right click)
  const [contextMenu, setContextMenu] = useState<{
    open: boolean
    x: number
    y: number
    msg: ChatMessage | null
  }>({ open: false, x: 0, y: 0, msg: null })

  // Reply State
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)

  // Forward State
  const [forwardModalOpen, setForwardModalOpen] = useState(false)
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null)
  const [forwardSearch, setForwardSearch] = useState("")
  const [forwardSearching, setForwardSearching] = useState(false)
  const [forwardResults, setForwardResults] = useState<SearchUsersResult[]>([])
  const [forwardTarget, setForwardTarget] = useState<TargetUser | null>(null)
  const forwardDebounceRef = useRef<number | null>(null)

  // Hover reaction popup (3 sec)
  const hoverTimerRef = useRef<number | null>(null)
  const [reactionPopup, setReactionPopup] = useState<{
    open: boolean
    msgId: number | null
  }>({ open: false, msgId: null })

  // Force open reactions (from context menu react)
  const [forceReactionForMsgId, setForceReactionForMsgId] = useState<number | null>(
    null
  )

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewLocalUrl(null)
      return
    }

    const url = URL.createObjectURL(imageFile)
    setImagePreviewLocalUrl(url)

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [imageFile])

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior })
    })
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!forceReactionForMsgId) return

      const el = reactionBoxRef.current
      if (!el) return

      if (!el.contains(e.target as Node)) {
        setForceReactionForMsgId(null)
      }
    }

    window.addEventListener("mousedown", handleClickOutside)
    return () => window.removeEventListener("mousedown", handleClickOutside)
  }, [forceReactionForMsgId])

  const updateInboxCardLastMessage = (
    conversationId: number,
    newLastMessage: LastMessage
  ) => {
    setInbox((prev) => {
      if (!prev) return prev

      const updateList = (list: InboxCard[]) =>
        list.map((c) => {
          if (c.conversation.id !== conversationId) return c
          return {
            ...c,
            conversation: {
              ...c.conversation,
              last_message_at: newLastMessage.created_at,
            },
            last_message: newLastMessage,
          }
        })

      return {
        ...prev,
        pending_received: updateList(prev.pending_received),
        pending_sent: updateList(prev.pending_sent),
        accepted: updateList(prev.accepted),
      }
    })
  }

  const markReadBackend = async (conversationId: number) => {
    try {
      await apiPost(`${API_BASE}/${conversationId}/mark-read/`)
    } catch {}

    setInbox((prev) => {
      if (!prev) return prev

      const clearUnread = (list: InboxCard[]) =>
        list.map((c) => {
          if (c.conversation.id !== conversationId) return c
          return {
            ...c,
            conversation: {
              ...c.conversation,
              unread_count: 0,
            },
          }
        })

      return {
        ...prev,
        pending_received: clearUnread(prev.pending_received),
        pending_sent: clearUnread(prev.pending_sent),
        accepted: clearUnread(prev.accepted),
      }
    })
  }

  // close context menu when clicking anywhere
  useEffect(() => {
    const close = () => setContextMenu({ open: false, x: 0, y: 0, msg: null })

    window.addEventListener("click", close)
    window.addEventListener("scroll", close, true)

    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [])

  // Load me
  useEffect(() => {
    let mounted = true

    async function loadMe() {
      try {
        const data = await apiGet<MeResponse>(API_ME)
        if (!mounted) return
        setMe(data)
      } catch {
        setMe({ ok: false, error: "Not authenticated" })
      }
    }

    loadMe()
    return () => {
      mounted = false
    }
  }, [])

  // Load inbox once
  useEffect(() => {
    let mounted = true

    async function loadInbox() {
      try {
        setLoadingInbox(true)
        const data = await apiGet<InboxResponse>(`${API_BASE}/inbox/`)
        if (!mounted) return
        setInbox(data)
      } catch (err) {
        console.error("Inbox load failed:", err)
      } finally {
        if (mounted) setLoadingInbox(false)
      }
    }

    loadInbox()
    return () => {
      mounted = false
    }
  }, [])

  // Poll inbox
  useEffect(() => {
    let mounted = true

    async function refreshInbox() {
      try {
        const data = await apiGet<InboxResponse>(`${API_BASE}/inbox/`)
        if (!mounted) return
        setInbox(data)

        if (selectedCard) {
          const combined = [
            ...(data.pending_received ?? []),
            ...(data.pending_sent ?? []),
            ...(data.accepted ?? []),
          ]
          const updated = combined.find(
            (x) => x.conversation.id === selectedCard.conversation.id
          )
          if (updated) setSelectedCard(updated)
        }
      } catch {}
    }

    const t = window.setInterval(refreshInbox, 2000)
    return () => {
      mounted = false
      window.clearInterval(t)
    }
  }, [selectedCard])

  // Left panel list
  const chatList = useMemo(() => {
    const pendingReceived = inbox?.pending_received ?? []
    const pendingSent = inbox?.pending_sent ?? []
    const accepted = inbox?.accepted ?? []

    const combined = [...pendingReceived, ...accepted, ...pendingSent]

    const filtered = combined.filter((item) =>
      item.target_user.full_name
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    )

    return [...filtered].sort((a, b) => {
      const aUnread = a.conversation.unread_count || 0
      const bUnread = b.conversation.unread_count || 0

      if (aUnread > 0 && bUnread === 0) return -1
      if (bUnread > 0 && aUnread === 0) return 1

      const aTime =
        a.last_message?.created_at ||
        a.conversation.last_message_at ||
        a.conversation.created_at

      const bTime =
        b.last_message?.created_at ||
        b.conversation.last_message_at ||
        b.conversation.created_at

      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
  }, [inbox, search])

  const selectedConversationId = selectedCard?.conversation.id ?? null

  // ✅ FIX: clear pinned reply when switching chats
  useEffect(() => {
    setReplyTo(null)
  }, [selectedConversationId])

  // Load messages
  useEffect(() => {
    if (!selectedConversationId) return

    let mounted = true

    async function loadMessages() {
  const conversationId = selectedConversationId
  if (conversationId == null) return

  try {
    setLoadingMessages(true)
    const data = await apiGet<MessagesResponse>(
      `${API_BASE}/${conversationId}/messages/`
    )

    if (!mounted) return

    setMessages(data.messages)
    lastMessageIdRef.current =
      data.messages.length > 0
        ? data.messages[data.messages.length - 1].id
        : 0

    await markReadBackend(conversationId)
    setShouldAutoScroll(true)
  } catch (err) {
    console.error("Messages load failed:", err)
  } finally {
    if (mounted) setLoadingMessages(false)
  }
}

    loadMessages()

    return () => {
      mounted = false
    }
  }, [selectedConversationId])

  // Poll messages
  useEffect(() => {
    if (!selectedConversationId) return

    if (pollingRef.current) {
      window.clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    const conversationId = selectedConversationId

pollingRef.current = window.setInterval(async () => {
  try {
    if (conversationId == null) return

    const after = lastMessageIdRef.current || 0
    const data = await apiGet<MessagesResponse>(
      `${API_BASE}/${conversationId}/messages/?after=${after}`
    )

    if (data.messages?.length) {
      setMessages((prev) => {
        const merged = [...prev, ...data.messages]
        lastMessageIdRef.current = merged[merged.length - 1].id
        return merged
      })

      scrollToBottom("smooth")

      const newest = data.messages[data.messages.length - 1]
      updateInboxCardLastMessage(conversationId, {
        id: newest.id,
        sender_id: newest.sender_id,
        text: newest.text,
        has_image: !!newest.image_url,
        image_url: newest.image_url,
        created_at: newest.created_at,
      })
    }
  } catch {}
}, 2000)

    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [selectedConversationId])

  // open chat => scroll bottom
  useEffect(() => {
    if (!shouldAutoScroll) return
    if (!selectedConversationId) return

    const t = window.setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "auto" })
      setShouldAutoScroll(false)
    }, 150)

    return () => window.clearTimeout(t)
  }, [shouldAutoScroll, selectedConversationId, messages.length])

  // Group messages by day
  const groupedMessages = useMemo(() => {
    const acc: Record<string, ChatMessage[]> = {}
    for (const m of messages) {
      const key = format(new Date(m.created_at), "d MMM, yyyy")
      if (!acc[key]) acc[key] = []
      acc[key].push(m)
    }
    return acc
  }, [messages])

  // typing rules
  const conv = selectedCard?.conversation
  const status = conv?.status

  const isPending = status === "pending"
  const isAccepted = status === "accepted"

  const isInitiator =
    !!conv && myUserId !== null && conv.initiator_id === myUserId

  const isRecipient =
    !!conv && myUserId !== null && conv.recipient_id === myUserId

  const canType =
    isAccepted || (isPending && isInitiator && messages.length === 0)

  // Paste image (CTRL+V)
  const handlePasteImage = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!canType) return

    const items = e.clipboardData?.items
    if (!items || items.length === 0) return

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile()
        if (file) {
          setImageFile(file)
          e.preventDefault()
          return
        }
      }
    }
  }

  // Reaction Logic (backend)
  const toggleReaction = async (msgId: number, emoji: string) => {
    const target = messages.find((m) => m.id === msgId)
    if (target && myUserId && target.sender_id === myUserId) return

    // optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m

        const reactions = m.reactions ? [...m.reactions] : []
        const myReactions = new Set(m.my_reactions || [])

        const alreadyMine = myReactions.has(emoji)

        if (alreadyMine) {
          myReactions.delete(emoji)
          const idx = reactions.findIndex((x) => x.emoji === emoji)
          if (idx >= 0) {
            const newCount = reactions[idx].count - 1
            if (newCount <= 0) reactions.splice(idx, 1)
            else reactions[idx] = { emoji, count: newCount }
          }
        } else {
          myReactions.add(emoji)
          const idx = reactions.findIndex((x) => x.emoji === emoji)
          if (idx >= 0) reactions[idx] = { emoji, count: reactions[idx].count + 1 }
          else reactions.push({ emoji, count: 1 })
        }

        return {
          ...m,
          reactions,
          my_reactions: Array.from(myReactions),
        }
      })
    )

    try {
      await apiToggleReaction(msgId, emoji)
    } catch (e) {
  const conversationId = selectedConversationId
  if (conversationId == null) return

  const data = await apiGet<MessagesResponse>(
    `${API_BASE}/${conversationId}/messages/`
  )
  setMessages(data.messages)
}
  }

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      if (msg.image_url) {
        try {
          const res = await fetch(msg.image_url, { credentials: "include" })
          const blob = await res.blob()
          const mime = blob.type || "image/png"

          await navigator.clipboard.write([
            new ClipboardItem({
              [mime]: blob,
            }),
          ])
          return
        } catch (err) {
          console.warn("Fetch copy failed, trying canvas method...", err)
        }

        const img = new Image()
        img.crossOrigin = "anonymous"
        img.src = msg.image_url

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error("Image load failed"))
        })

        const canvas = document.createElement("canvas")
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight

        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Canvas not supported")

        ctx.drawImage(img, 0, 0)

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png")
        )

        if (!blob) throw new Error("Failed to convert image")

        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": blob,
          }),
        ])

        return
      }

      if (msg.text && msg.text.trim()) {
        await navigator.clipboard.writeText(msg.text.trim())
        return
      }
    } catch (err) {
      console.error("Copy failed:", err)
      alert(
        "Copy failed. Your browser blocked copying image to clipboard (CORS / permissions)."
      )
    }
  }

  const handleSend = async () => {
    if (!selectedCard) return
    if (!messageText.trim() && !imageFile) return

    if (isPending && isRecipient) {
      alert("You must accept the ticket before replying.")
      return
    }

    if (isPending && isInitiator && messages.length >= 1) {
      alert("You can only send 1 message until the other person accepts.")
      return
    }

    if (!isPending && !isAccepted) {
      alert("Chat is not available.")
      return
    }

    try {
      const sendingText = messageText.trim() ? messageText.trim() : null
      const sendingHasImage = !!imageFile

      await apiSendMessage({
        receiver_id: selectedCard.target_user.id,
        text: sendingText ? sendingText : undefined,
        image: imageFile,
        reply_to_id: replyTo?.id || undefined,
      })

      updateInboxCardLastMessage(selectedCard.conversation.id, {
        id: Date.now(),
        sender_id: myUserId || 0,
        text: sendingText,
        has_image: sendingHasImage,
        image_url: null,
        created_at: new Date().toISOString(),
      })

      setMessageText("")
      setImageFile(null)
      setReplyTo(null)

      const data = await apiGet<MessagesResponse>(
        `${API_BASE}/${selectedCard.conversation.id}/messages/`
      )
      setMessages(data.messages)

      lastMessageIdRef.current =
        data.messages.length > 0
          ? data.messages[data.messages.length - 1].id
          : 0

      scrollToBottom("smooth")
    } catch (err: any) {
      console.error(err)
      alert(err?.message || "Send failed")
    }
  }

  // NEW MESSAGE MODAL SEARCH
  useEffect(() => {
    if (!newMessageOpen) return

    setToSearch("")
    setSearchResults([])
    setSelectedTarget(null)

    setTimeout(() => {
      toInputRef.current?.focus()
    }, 80)
  }, [newMessageOpen])

  useEffect(() => {
    if (!newMessageOpen) return

    const q = toSearch.trim()

    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }

    if (q.length < 2) {
      setSearchResults([])
      setSearchingUsers(false)
      return
    }

    searchDebounceRef.current = window.setTimeout(async () => {
      try {
        setSearchingUsers(true)
        const data = await apiGet<SearchUsersResponse>(
          `${API_BASE}/search-users/?q=${encodeURIComponent(q)}`
        )
        setSearchResults(data.results || [])
      } catch (err) {
        console.error("User search failed:", err)
        setSearchResults([])
      } finally {
        setSearchingUsers(false)
      }
    }, 250)

    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = null
      }
    }
  }, [toSearch, newMessageOpen])

  const handleStartChat = async () => {
    if (!selectedTarget) return

    try {
      await apiSendMessage({
        receiver_id: selectedTarget.id,
        text: "Hi 👋",
      })

      const inboxData = await apiGet<InboxResponse>(`${API_BASE}/inbox/`)
      setInbox(inboxData)

      const combined = [
        ...(inboxData.pending_received ?? []),
        ...(inboxData.pending_sent ?? []),
        ...(inboxData.accepted ?? []),
      ]

      const found = combined.find((x) => x.target_user.id === selectedTarget.id)

      if (found) {
        setSelectedCard(found)
        setShouldAutoScroll(true)
      }

      setNewMessageOpen(false)
      setSelectedTarget(null)
      setToSearch("")
      setSearchResults([])
    } catch (err: any) {
      console.error(err)
      alert(err?.message || "Failed to start chat")
    }
  }

  // Forward search
  useEffect(() => {
    if (!forwardModalOpen) return

    const q = forwardSearch.trim()

    if (forwardDebounceRef.current) {
      window.clearTimeout(forwardDebounceRef.current)
      forwardDebounceRef.current = null
    }

    if (q.length < 2) {
      setForwardResults([])
      setForwardSearching(false)
      return
    }

    forwardDebounceRef.current = window.setTimeout(async () => {
      try {
        setForwardSearching(true)
        const data = await apiGet<SearchUsersResponse>(
          `${API_BASE}/search-users/?q=${encodeURIComponent(q)}`
        )
        setForwardResults(data.results || [])
      } catch {
        setForwardResults([])
      } finally {
        setForwardSearching(false)
      }
    }, 250)

    return () => {
      if (forwardDebounceRef.current) {
        window.clearTimeout(forwardDebounceRef.current)
        forwardDebounceRef.current = null
      }
    }
  }, [forwardSearch, forwardModalOpen])

  const handleForward = async () => {
    if (!forwardMessage) return
    if (!forwardTarget) return

    try {
      await apiSendMessage({
        receiver_id: forwardTarget.id,
        text: forwardMessage.text || undefined,
        is_forwarded: true,
        forwarded_from_id: forwardMessage.sender_id,
      })

      setForwardModalOpen(false)
      setForwardMessage(null)
      setForwardTarget(null)
      setForwardSearch("")
      setForwardResults([])
    } catch (err: any) {
      alert(err?.message || "Forward failed")
    }
  }

  // ===== UX helper: keep context menu on-screen (UI only)
  const safeContextMenuPos = useMemo(() => {
    if (!contextMenu.open) return { left: 0, top: 0 }
    const menuW = 200
    const menuH = 210
    const pad = 10
    const x = Math.min(contextMenu.x, window.innerWidth - menuW - pad)
    const y = Math.min(contextMenu.y, window.innerHeight - menuH - pad)
    return { left: x, top: y }
  }, [contextMenu.open, contextMenu.x, contextMenu.y])

  return (
    <div className="h-full w-full bg-background">
      <div className="h-full w-full px-4 py-4 lg:px-6">
        <div className="mx-auto flex h-[calc(100vh-120px)] max-w-6xl gap-4 overflow-hidden">
          {/* LEFT */}
          <Card className="flex h-full w-[360px] flex-col overflow-hidden border bg-card">
            {/* Sticky header */}
            <div className="shrink-0 border-b bg-card/70 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/60">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h2 className="text-lg font-semibold leading-none">Inbox</h2>
                  <p className="text-xs text-muted-foreground">
                    Your recent conversations
                  </p>
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-xl hover:bg-muted"
                  onClick={() => setNewMessageOpen(true)}
                  title="New message"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl border bg-background px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/30">
                <SearchIcon className="h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-2">
                {loadingInbox ? (
                  <div className="space-y-1">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <InboxSkeletonItem key={i} />
                    ))}
                  </div>
                ) : chatList.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border bg-background">
                      <MessagesSquare className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="mt-3 text-sm font-medium">No chats found</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Try searching another name.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {chatList.map((item) => {
                      const { conversation, target_user, last_message } = item
                      const lastMsgPreview = getLastMessagePreview(last_message)

                      const isActive =
                        selectedCard?.conversation.id === conversation.id

                      const unreadCount = conversation.unread_count || 0
                      const isUnread = unreadCount > 0

                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={async () => {
                            setSelectedCard(item)
                            setShouldAutoScroll(true)
                            await markReadBackend(conversation.id)
                          }}
                          className={cn(
                            "group w-full rounded-xl p-3 text-left transition",
                            "hover:bg-muted/60",
                            isActive && "bg-muted"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 ring-1 ring-border">
                              <AvatarImage
                                src={target_user.avatar_url || ""}
                                alt={target_user.username}
                              />
                              <AvatarFallback className="text-xs">
                                {getInitials(target_user.full_name)}
                              </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-medium">
                                  {target_user.full_name}
                                </p>

                                {isUnread && (
                                  <span className="shrink-0 rounded-full bg-primary px-2 py-[2px] text-[11px] font-semibold text-primary-foreground shadow-sm">
                                    {unreadCount}
                                  </span>
                                )}
                              </div>

                              <p
                                className={cn(
                                  "mt-0.5 truncate text-xs text-muted-foreground",
                                  isUnread && "font-semibold text-foreground"
                                )}
                              >
                                {conversation.status === "pending"
                                  ? `🟡 Pending: ${lastMsgPreview}`
                                  : lastMsgPreview}
                              </p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>

          {/* RIGHT */}
          <Card className="flex h-full flex-1 flex-col overflow-hidden border bg-card">
            {/* Sticky top bar */}
            <div className="shrink-0 border-b bg-card/70 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/60">
              {selectedCard ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 ring-1 ring-border">
                      <AvatarImage
                        src={selectedCard.target_user.avatar_url || ""}
                        alt={selectedCard.target_user.username}
                      />
                      <AvatarFallback className="text-xs">
                        {getInitials(selectedCard.target_user.full_name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="leading-tight">
                      <p className="text-sm font-semibold">
                        {selectedCard.target_user.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedCard.target_user.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 rounded-xl hover:bg-muted"
                      title="Video call"
                    >
                      <Video className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 rounded-xl hover:bg-muted"
                      title="Audio call"
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 rounded-xl hover:bg-muted"
                      title="More"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <MessagesSquare className="h-4 w-4" />
                    Select a conversation
                  </div>

                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setNewMessageOpen(true)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    New message
                  </Button>
                </div>
              )}
            </div>

            {!selectedCard ? (
              <div className="flex flex-1 min-h-0 flex-col items-center justify-center px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border bg-background shadow-sm">
                  <MessagesSquare className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">Your messages</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Send a message to start a chat. You can also attach images and
                  react to messages.
                </p>

                <Button className="mt-5 rounded-xl" onClick={() => setNewMessageOpen(true)}>
                  Send message
                </Button>
              </div>
            ) : (
              <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                {/* Pending Accept/Reject Banner */}
                {selectedCard?.conversation.status === "pending" && isRecipient && (
                  <div className="shrink-0 border-b bg-muted/10 px-4 py-3">
                    <div className="flex flex-col gap-3 rounded-xl border bg-background px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">Pending ticket</p>
                        <p className="text-xs text-muted-foreground">
                          Accept to start chatting. Reject to close this request.
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl"
                          onClick={async () => {
                            try {
                              await apiPost(
                                `${API_BASE}/${selectedCard.conversation.id}/reject/`
                              )

                              const inboxData = await apiGet<InboxResponse>(
                                `${API_BASE}/inbox/`
                              )
                              setInbox(inboxData)

                              setSelectedCard(null)
                              setMessages([])
                            } catch (err: any) {
                              alert(err?.message || "Reject failed")
                            }
                          }}
                        >
                          Reject
                        </Button>

                        <Button
                          size="sm"
                          className="rounded-xl"
                          onClick={async () => {
                            try {
                              await apiPost(
                                `${API_BASE}/${selectedCard.conversation.id}/accept/`
                              )

                              const inboxData = await apiGet<InboxResponse>(
                                `${API_BASE}/inbox/`
                              )
                              setInbox(inboxData)

                              const combined = [
                                ...(inboxData.pending_received ?? []),
                                ...(inboxData.pending_sent ?? []),
                                ...(inboxData.accepted ?? []),
                              ]

                              const updated = combined.find(
                                (x) =>
                                  x.conversation.id === selectedCard.conversation.id
                              )

                              if (updated) setSelectedCard(updated)
                            } catch (err: any) {
                              alert(err?.message || "Accept failed")
                            }
                          }}
                        >
                          Accept
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Messages */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="space-y-4 p-4">
                    {loadingMessages ? (
                      <div className="space-y-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <MessageSkeletonBlock key={i} mine={i % 2 === 0} />
                        ))}
                      </div>
                    ) : Object.keys(groupedMessages).length === 0 ? (
                      <div className="py-14 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border bg-background">
                          <MessagesSquare className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="mt-3 text-sm font-medium">
                          No messages yet
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Say hello 👋 to start the conversation.
                        </div>
                      </div>
                    ) : (
                      Object.keys(groupedMessages).map((dayKey) => (
                        <div key={dayKey} className="space-y-3">
                          <div className="flex items-center gap-3">
                            <Separator className="flex-1" />
                            <span className="rounded-full border bg-background px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
                              {dayKey}
                            </span>
                            <Separator className="flex-1" />
                          </div>

                          <div className="space-y-2">
                            {groupedMessages[dayKey].map((msg, index) => {
                              const isMine = myUserId
                                ? msg.sender_id === myUserId
                                : false

                              const reactions = msg.reactions || []
                              const myReacts = new Set(msg.my_reactions || [])

                              return (
                                <div
                                  key={`${msg.sender_id}-${msg.created_at}-${index}`}
                                  className={cn(
                                    "flex",
                                    isMine ? "justify-end" : "justify-start"
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "relative max-w-[78%] sm:max-w-[72%]",
                                      "group/message"
                                    )}
                                    onContextMenu={(e) => {
                                      e.preventDefault()
                                      setContextMenu({
                                        open: true,
                                        x: e.clientX,
                                        y: e.clientY,
                                        msg,
                                      })
                                    }}
                                    onMouseEnter={() => {
                                      if (hoverTimerRef.current) {
                                        window.clearTimeout(hoverTimerRef.current)
                                      }

                                      hoverTimerRef.current = window.setTimeout(
                                        () => {
                                          if (!isMine) {
                                            setReactionPopup({
                                              open: true,
                                              msgId: msg.id,
                                            })
                                          }
                                        },
                                        3000
                                      )
                                    }}
                                    onMouseLeave={() => {
                                      if (hoverTimerRef.current) {
                                        window.clearTimeout(hoverTimerRef.current)
                                        hoverTimerRef.current = null
                                      }

                                      setReactionPopup({ open: false, msgId: null })
                                    }}
                                  >
                                    {/* Reaction popup */}
                                    {((reactionPopup.open &&
                                      reactionPopup.msgId === msg.id) ||
                                      forceReactionForMsgId === msg.id) &&
                                      !isMine && (
                                        <div
                                          ref={
                                            forceReactionForMsgId === msg.id
                                              ? reactionBoxRef
                                              : null
                                          }
                                          className={cn(
                                            "absolute -top-11 z-50 flex gap-1 rounded-full border bg-background/95 px-2 py-1 shadow-lg backdrop-blur",
                                            isMine ? "right-0" : "left-0"
                                          )}
                                        >
                                          {QUICK_REACTIONS.map((emo) => (
                                            <button
                                              key={emo}
                                              type="button"
                                              className={cn(
                                                "h-8 w-8 rounded-full text-base transition",
                                                "hover:bg-muted active:scale-95",
                                                myReacts.has(emo) && "bg-muted"
                                              )}
                                              onClick={() => {
                                                toggleReaction(msg.id, emo)
                                                setForceReactionForMsgId(null)
                                              }}
                                            >
                                              {emo}
                                            </button>
                                          ))}
                                        </div>
                                      )}

                                    {/* Bubble */}
                                    <div
                                      className={cn(
                                        "rounded-2xl px-3 py-2 text-sm shadow-sm",
                                        "border border-transparent",
                                        isMine
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted text-foreground"
                                      )}
                                    >
                                      {msg.reply_to && (
                                        
                                        <div className="mb-2 rounded-xl border bg-background/50 px-2.5 py-2 text-xs">
                                          <div className="font-semibold opacity-80">
                                            Reply to
                                          </div>
                                          <div className="mt-0.5 truncate opacity-70">
                                            {msg.reply_to.text || "📷 Image"}
                                          </div>
                                        </div>
                                      )}

                                      {msg.is_forwarded && (
                                        <div className="mb-1 text-[11px] opacity-70">
                                          Forwarded
                                        </div>
                                      )}

                                      {msg.text && (
                                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                                          {msg.text}
                                        </p>
                                      )}

                                      {msg.image_url && (
                                        <img
                                          src={msg.image_url}
                                          alt="chat"
                                          className="mt-2 max-w-[280px] cursor-zoom-in rounded-xl border bg-background object-cover shadow-sm"
                                          onClick={() => {
                                            setPreviewImageUrl(msg.image_url!)
                                            setImagePreviewOpen(true)
                                          }}
                                        />
                                      )}

                                      <p
                                        className={cn(
                                          "mt-1.5 text-[11px] opacity-70",
                                          isMine && "text-right"
                                        )}
                                      >
                                        {format(new Date(msg.created_at), "h:mm a")}
                                      </p>
                                    </div>

                                    {/* Reaction display */}
                                    {reactions.length > 0 && (
                                      <div
                                        className={cn(
                                          "mt-1 inline-flex flex-wrap items-center gap-1 rounded-full border bg-background/95 px-2 py-[2px] text-xs shadow-sm backdrop-blur",
                                          isMine ? "ml-auto" : ""
                                        )}
                                      >
                                        {reactions.slice(0, 8).map((r) => (
                                          <button
                                            key={r.emoji}
                                            type="button"
                                            className={cn(
                                              "rounded-full px-2 py-[2px] transition",
                                              "hover:bg-muted active:scale-95",
                                              myReacts.has(r.emoji) && "bg-muted"
                                            )}
                                            onClick={() =>
                                              toggleReaction(msg.id, r.emoji)
                                            }
                                            disabled={isMine}
                                          >
                                            {r.emoji} {r.count}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))
                    )}

                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>

                {/* INPUT AREA (premium) */}
                <div className="shrink-0 border-t bg-card px-3 py-3">
                  {/* Reply preview */}
                  {replyTo && (
                    <div className="mb-2 flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">Replying</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {replyTo.text || "📷 Image"}
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 rounded-xl"
                        onClick={() => setReplyTo(null)}
                        title="Cancel reply"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <form
                    className="flex items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleSend()
                    }}
                  >
                    <Button
                      size="icon"
                      type="button"
                      variant="ghost"
                      className="h-10 w-10 rounded-xl"
                      title="More"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>

                    <div
                      className={cn(
                        "flex flex-1 items-end gap-2 rounded-2xl border bg-background px-3 py-2",
                        "shadow-sm transition-all",
                        "hover:shadow-md",
                        "focus-within:ring-2 focus-within:ring-primary/30"
                      )}
                    >
                      {/* Emoji */}
                      <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            size="icon"
                            type="button"
                            variant="ghost"
                            className="h-9 w-9 rounded-xl"
                            disabled={!canType}
                            title="Emoji"
                          >
                            <Smile className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>

                        <PopoverContent
                          align="start"
                          className="w-[300px] rounded-2xl p-3"
                          side="top"
                        >
                          <div className="mb-2 text-xs font-medium text-muted-foreground">
                            Pick emojis
                          </div>

                          <div className="grid grid-cols-10 gap-1">
                            {EMOJIS.map((emo) => (
                              <button
                                key={emo}
                                type="button"
                                className={cn(
                                  "h-8 w-8 rounded-xl text-base transition",
                                  "hover:bg-muted active:scale-95"
                                )}
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setMessageText((prev) => prev + emo)
                                }}
                              >
                                {emo}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* Image picker */}
                      <Button
                        size="icon"
                        type="button"
                        variant="ghost"
                        className="h-9 w-9 rounded-xl"
                        disabled={!canType}
                        title="Attach image"
                        onClick={() => {
                          const el = document.getElementById(
                            "chat-image-picker"
                          ) as HTMLInputElement | null
                          el?.click()
                        }}
                      >
                        <ImagePlus className="h-4 w-4" />
                      </Button>

                      <input
                        id="chat-image-picker"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          setImageFile(file)
                        }}
                        disabled={!canType}
                      />

                      {/* Selected image thumbnail */}
                      {imagePreviewLocalUrl && (
                        <div className="relative mb-[2px]">
                          <img
                            src={imagePreviewLocalUrl}
                            alt="selected"
                            className="h-10 w-10 rounded-xl border object-cover shadow-sm"
                          />
                          <button
                            type="button"
                            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-background text-[10px] shadow"
                            onClick={() => setImageFile(null)}
                            title="Remove image"
                          >
                            ✕
                          </button>
                        </div>
                      )}

                      {/* Textarea */}
                      <textarea
                        placeholder={
                          canType
                            ? "Type a message..."
                            : isPending && isInitiator
                            ? "Waiting for the recipient to respond..."
                            : "Chat disabled"
                        }
                        className={cn(
                          "max-h-28 min-h-[44px] w-full resize-none bg-transparent text-sm outline-none",
                          "placeholder:text-muted-foreground leading-relaxed",
                          "px-1"
                        )}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        disabled={!canType}
                        onPaste={handlePasteImage}
                        onKeyDown={(e) => {
                          if (!canType) return
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            handleSend()
                          }
                        }}
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={!canType}
                      className={cn(
                        "h-10 rounded-xl px-4",
                        "shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                      )}
                      title="Send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu.open && contextMenu.msg && (
        <div
          className="fixed z-[999] w-[200px] overflow-hidden rounded-xl border bg-background shadow-xl"
          style={safeContextMenuPos}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              setReplyTo(contextMenu.msg)
              setContextMenu({ open: false, x: 0, y: 0, msg: null })
            }}
          >
            <Reply className="h-4 w-4" />
            Reply
          </button>

          <button
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              setForwardMessage(contextMenu.msg)
              setForwardModalOpen(true)
              setContextMenu({ open: false, x: 0, y: 0, msg: null })
            }}
          >
            <Forward className="h-4 w-4" />
            Forward
          </button>

          <button
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              handleCopyMessage(contextMenu.msg!)
              setContextMenu({ open: false, x: 0, y: 0, msg: null })
            }}
          >
            <Copy className="h-4 w-4" />
            Copy
          </button>

          {myUserId && contextMenu.msg.sender_id !== myUserId && (
            <button
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                setForceReactionForMsgId(contextMenu.msg!.id)
                setContextMenu({ open: false, x: 0, y: 0, msg: null })
              }}
            >
              <SmilePlus className="h-4 w-4" />
              React
            </button>
          )}
        </div>
      )}

      {/* Forward modal */}
      <Dialog open={forwardModalOpen} onOpenChange={setForwardModalOpen}>
        <DialogContent className="max-w-[640px] overflow-hidden rounded-2xl p-0">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <DialogTitle className="text-base font-semibold">
              Forward message
            </DialogTitle>
          </div>

          <div className="p-5">
            <div className="text-sm text-muted-foreground mb-2">To:</div>

            <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/30">
              <SearchIcon className="h-4 w-4 text-muted-foreground" />
              <Input
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
                placeholder="Search people..."
                className="border-0 p-0 focus-visible:ring-0"
              />
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border">
              <ScrollArea className="h-[320px]">
                <div className="p-2">
                  {forwardSearching ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      Searching...
                    </div>
                  ) : forwardSearch.trim().length < 2 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      Type at least 2 characters
                    </div>
                  ) : forwardResults.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      No users found
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {forwardResults.map((r) => {
                        const u = r.user
                        const active = forwardTarget?.id === u.id

                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setForwardTarget(u)}
                            className={cn(
                              "w-full rounded-xl px-3 py-2 text-left transition",
                              "hover:bg-muted/60",
                              active && "bg-muted"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9 ring-1 ring-border">
                                <AvatarImage src={u.avatar_url || ""} />
                                <AvatarFallback className="text-xs">
                                  {getInitials(u.full_name || u.username)}
                                </AvatarFallback>
                              </Avatar>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {u.full_name || u.username}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {u.username}
                                </p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <Button
              className="mt-4 w-full rounded-xl"
              disabled={!forwardTarget}
              onClick={handleForward}
            >
              Forward
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Zoom Preview */}
      <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
        <DialogContent className="max-w-4xl overflow-hidden rounded-2xl p-0">
          <div className="flex items-center justify-center bg-black/90 p-4">
            {previewImageUrl && (
              <img
                src={previewImageUrl}
                alt="preview"
                className="max-h-[80vh] w-auto rounded-xl object-contain shadow-2xl"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* NEW MESSAGE MODAL */}
      <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
        <DialogContent className="max-w-[640px] overflow-hidden rounded-2xl p-0">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <DialogTitle className="text-base font-semibold">
              New message
            </DialogTitle>
          </div>

          <div className="p-5">
            <div className="text-sm text-muted-foreground mb-2">To:</div>

            <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/30">
              <SearchIcon className="h-4 w-4 text-muted-foreground" />
              <Input
                ref={toInputRef}
                value={toSearch}
                onChange={(e) => setToSearch(e.target.value)}
                placeholder="Search people..."
                className="border-0 p-0 focus-visible:ring-0"
              />
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border">
              <ScrollArea className="h-[320px]">
                <div className="p-2">
                  {searchingUsers ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      Searching...
                    </div>
                  ) : toSearch.trim().length < 2 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      Type at least 2 characters
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      No users found
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {searchResults.map((r) => {
                        const u = r.user
                        const active = selectedTarget?.id === u.id

                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setSelectedTarget(u)}
                            className={cn(
                              "w-full rounded-xl px-3 py-2 text-left transition",
                              "hover:bg-muted/60",
                              active && "bg-muted"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9 ring-1 ring-border">
                                <AvatarImage src={u.avatar_url || ""} />
                                <AvatarFallback className="text-xs">
                                  {getInitials(u.full_name || u.username)}
                                </AvatarFallback>
                              </Avatar>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {u.full_name || u.username}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {u.username}
                                </p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <Button
              className="mt-4 w-full rounded-xl"
              disabled={!selectedTarget}
              onClick={handleStartChat}
            >
              Chat
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

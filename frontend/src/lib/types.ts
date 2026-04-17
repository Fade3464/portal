export type EmpDetailsType = {
  id: number
  name: string
  cnic: string
  contact_number: string
  post_applied_for: string
  created_at: string
  joining_date: string
  salary: string | number
  punctuality: string
  project_applied_for: string
  references: string
  status: string

  proceeded_for_final_interview?: boolean
}
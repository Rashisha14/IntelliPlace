-- CreateTable
CREATE TABLE "aptitude_submissions" (
    "id" SERIAL NOT NULL,
    "test_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "passed" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aptitude_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aptitude_submissions_test_id_idx" ON "aptitude_submissions"("test_id");

-- CreateIndex
CREATE INDEX "aptitude_submissions_student_id_idx" ON "aptitude_submissions"("student_id");

-- AddForeignKey
ALTER TABLE "aptitude_submissions" ADD CONSTRAINT "aptitude_submissions_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "aptitude_tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aptitude_submissions" ADD CONSTRAINT "aptitude_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

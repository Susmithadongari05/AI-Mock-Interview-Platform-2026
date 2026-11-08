import * as resumeService from '../services/resume.service.js';


// ===============================
// UPLOAD RESUME
// ===============================

export const uploadResume = async (
  req,
  res,
  next
) => {

  try {

    // Check whether a file was uploaded
    if (!req.file) {

      return res.status(400).json({
        success: false,
        message:
          'No file uploaded. Please select a PDF.',
      });

    }


    // Extract text from PDF
    const extractedText =
      await resumeService.parseResumePDF(
        req.file.buffer
      );


    // IMPORTANT:
    // Send ONLY the filename string,
    // NOT the complete req.file object.

    const resume =
      await resumeService.saveResume(
        req.user._id,
        req.file.originalname,
        extractedText
      );


    return res.json({

      success: true,

      data: {

        resumeId: resume._id,

        fileName: resume.fileName,

        preview:
          extractedText.substring(0, 500),

        text: extractedText,

      },

    });

  } catch (error) {

    next(error);

  }
};


// ===============================
// GET RESUME
// ===============================

export const getResume = async (
  req,
  res,
  next
) => {

  try {

    const resume =
      await resumeService.getUserResume(
        req.user._id
      );


    if (!resume) {

      return res.status(404).json({

        success: false,

        message:
          'No resume found. Please upload one.',

      });

    }


    return res.json({

      success: true,

      data: {

        resumeId: resume._id,

        fileName: resume.fileName,

        preview:
          resume.extractedText.substring(
            0,
            500
          ),

        text: resume.extractedText,

      },

    });

  } catch (error) {

    next(error);

  }
};
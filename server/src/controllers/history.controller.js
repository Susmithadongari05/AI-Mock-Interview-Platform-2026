import Interview from '../models/Interview.model.js';

const getHistory = async (req, res, next) => {
  try {
    const interviews = await Interview.find({
      userId: req.user._id,
    }).select('-resumeText').sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: interviews,
    });
  } catch (error) {
    next(error);
  }
};

const deleteHistoryItem = async (req, res, next) => {
  try {
    const interview = await Interview.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview not found.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Interview deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

const clearHistory = async (req, res, next) => {
  try {
    await Interview.deleteMany({
      userId: req.user._id,
    });

    return res.status(200).json({
      success: true,
      message: 'Interview history cleared successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export {
  getHistory,
  deleteHistoryItem,
  clearHistory,
};
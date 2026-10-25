/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase/client";
import { FiSave, FiRefreshCcw } from "react-icons/fi";

interface AppSettings {
  siteName: string;
  allowGuestAttempts: boolean;
  requireVerification: boolean;
  enableUserRegistration: boolean;
  defaultQuizDuration: number;
  maxFileUploadSize: number;
  maintenanceMode: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    siteName: "Ageno Quiz",
    allowGuestAttempts: true,
    requireVerification: false,
    enableUserRegistration: true,
    defaultQuizDuration: 30,
    maxFileUploadSize: 5,
    maintenanceMode: false,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const settingsDoc = await getDoc(doc(db, "settings", "appSettings"));

      if (settingsDoc.exists()) {
        setSettings(settingsDoc.data() as AppSettings);
      } else {
        // If settings document doesn't exist, we'll create it when saving
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      setMessage({ type: "error", text: "Failed to load settings." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (key: keyof AppSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      setMessage(null);

      // Update or create settings document
      await updateDoc(doc(db, "settings", "appSettings"), { ...settings });

      setMessage({ type: "success", text: "Settings saved successfully!" });
      setHasChanges(false);

      // Auto-dismiss success message after 3 seconds
      setTimeout(() => {
        setMessage((prev) => (prev?.type === "success" ? null : prev));
      }, 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
      setMessage({
        type: "error",
        text: "Failed to save settings. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Application Settings
          </h1>
          <p className="text-gray-600">Configure your quiz application</p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={fetchSettings}
            disabled={isLoading || isSaving}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            <FiRefreshCcw className="mr-2" />
            Refresh
          </button>

          <button
            onClick={handleSaveSettings}
            disabled={isLoading || isSaving || !hasChanges}
            className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
              isLoading || isSaving || !hasChanges
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            }`}
          >
            <FiSave className="mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Message display */}
      {message && (
        <div
          className={`p-4 mb-6 rounded-md ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {isLoading ? (
        <div className="p-6 text-center">
          <div className="inline-block animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
          <p className="mt-2 text-gray-600">Loading settings...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              General Settings
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Basic application configuration
            </p>
          </div>

          <div className="px-4 py-5 sm:p-6 space-y-6">
            {/* Site Name */}
            <div>
              <label
                htmlFor="siteName"
                className="block text-sm font-medium text-gray-700"
              >
                Site Name
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="siteName"
                  value={settings.siteName}
                  onChange={(e) => handleChange("siteName", e.target.value)}
                  className="shadow-sm focus:ring-purple-500 focus:border-purple-500 block w-full sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                The name of your quiz platform
              </p>
            </div>

            {/* Default Quiz Duration */}
            <div>
              <label
                htmlFor="defaultQuizDuration"
                className="block text-sm font-medium text-gray-700"
              >
                Default Quiz Duration (minutes)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="defaultQuizDuration"
                  min="1"
                  max="180"
                  value={settings.defaultQuizDuration}
                  onChange={(e) =>
                    handleChange(
                      "defaultQuizDuration",
                      parseInt(e.target.value)
                    )
                  }
                  className="shadow-sm focus:ring-purple-500 focus:border-purple-500 block w-full sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Default time limit for quizzes when not specified
              </p>
            </div>

            {/* Max File Upload Size */}
            <div>
              <label
                htmlFor="maxFileUploadSize"
                className="block text-sm font-medium text-gray-700"
              >
                Max File Upload Size (MB)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="maxFileUploadSize"
                  min="1"
                  max="20"
                  value={settings.maxFileUploadSize}
                  onChange={(e) =>
                    handleChange("maxFileUploadSize", parseInt(e.target.value))
                  }
                  className="shadow-sm focus:ring-purple-500 focus:border-purple-500 block w-full sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Maximum allowed size for image uploads
              </p>
            </div>
          </div>

          <div className="px-4 py-5 sm:px-6 border-b border-t border-gray-200 bg-gray-50">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              User Settings
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Control how users interact with your platform
            </p>
          </div>

          <div className="px-4 py-5 sm:p-6 space-y-6">
            {/* Allow Guest Attempts */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="allowGuestAttempts"
                  type="checkbox"
                  checked={settings.allowGuestAttempts}
                  onChange={(e) =>
                    handleChange("allowGuestAttempts", e.target.checked)
                  }
                  className="focus:ring-purple-500 h-4 w-4 text-purple-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label
                  htmlFor="allowGuestAttempts"
                  className="font-medium text-gray-700"
                >
                  Allow Guest Quiz Attempts
                </label>
                <p className="text-gray-500">
                  Allow users to take quizzes without registering or signing in
                </p>
              </div>
            </div>

            {/* Require Email Verification */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="requireVerification"
                  type="checkbox"
                  checked={settings.requireVerification}
                  onChange={(e) =>
                    handleChange("requireVerification", e.target.checked)
                  }
                  className="focus:ring-purple-500 h-4 w-4 text-purple-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label
                  htmlFor="requireVerification"
                  className="font-medium text-gray-700"
                >
                  Require Email Verification
                </label>
                <p className="text-gray-500">
                  Users must verify their email address before taking quizzes
                </p>
              </div>
            </div>

            {/* Enable User Registration */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="enableUserRegistration"
                  type="checkbox"
                  checked={settings.enableUserRegistration}
                  onChange={(e) =>
                    handleChange("enableUserRegistration", e.target.checked)
                  }
                  className="focus:ring-purple-500 h-4 w-4 text-purple-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label
                  htmlFor="enableUserRegistration"
                  className="font-medium text-gray-700"
                >
                  Enable User Registration
                </label>
                <p className="text-gray-500">
                  Allow new users to register on the platform
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 py-5 sm:px-6 border-b border-t border-gray-200 bg-gray-50">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Maintenance
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              System maintenance controls
            </p>
          </div>

          <div className="px-4 py-5 sm:p-6">
            {/* Maintenance Mode */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="maintenanceMode"
                  type="checkbox"
                  checked={settings.maintenanceMode}
                  onChange={(e) =>
                    handleChange("maintenanceMode", e.target.checked)
                  }
                  className="focus:ring-purple-500 h-4 w-4 text-purple-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label
                  htmlFor="maintenanceMode"
                  className="font-medium text-gray-700"
                >
                  Maintenance Mode
                </label>
                <p className="text-gray-500">
                  Put the site in maintenance mode (only administrators can
                  access)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
